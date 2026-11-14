// sim/life/tiled: a Life-like cellular automaton on an unbounded plane of 32 by 32 tiles, each row of a tile one 32-bit word, a generation
// computed 32 cells at a time by adding the eight neighbours' bits (a bit-sliced adder) and reading any Life-like rule
// off the sum. Only tiles with live cells or a live edge beside them are computed, and a tile whose neighbourhood did
// not change last generation is not computed at all. Every cell keeps the colour it was drawn or born in (a birth takes
// the average of its parents', as it always has here), the generation it was born in (its age) and how many generations
// it has lived before (its heat), so a step touches only the cells that are born or die. No React, no DOM: it runs in
// the page, in tests and headless. The square lattice only; other lattices step with lattice/sparse-ca.ts. With a
// family (Golly's History or Super, ./super.ts), every cell also keeps a state, moved on as Golly moves it.

import { nextState, restless, type Family } from "./super";

export const TILE = 32;
const CELLS = TILE * TILE;
/** tiles are keyed by their coordinates, each within +-2^20 tiles (33 million cells) of the origin */
const OFF = 1 << 20;
const SPAN = 1 << 21;
export const tileKey = (tx: number, ty: number) => (ty + OFF) * SPAN + (tx + OFF);
/** cells further than this from the origin leave the plane (a glider needs 134 million generations to get there) */
export const LIMIT = OFF * TILE - TILE;

export const DEFAULT_COLOR = 0x22d3ee;

export interface Tile {
  tx: number;
  ty: number;
  /** row y, bit x: the cell at column x of row y is alive */
  bits: Int32Array;
  next: Int32Array;
  /** 0xRRGGBB of each cell, kept after it dies (its heat's colour is not needed) */
  color: Uint32Array;
  /** the generation each live cell was born in */
  born: Int32Array;
  /** generations each cell lived in its earlier lives */
  heat: Uint32Array;
  pop: number;
  /** its bits changed in the last step (or were edited since) */
  changed: boolean;
  /** the generation it last had a live cell */
  lastLive: number;
  /** the step it last joined the work in */
  mark: number;
  /** each cell's state, in a world of a family (./super.ts): odd ones are the live bits, even ones dead */
  state?: Uint8Array;
}

/** Birth and survival counts (lattice/sparse-ca's LifeRule, or plain arrays); for a rule that is not totalistic (./rules.ts),
 *  a table of 512, next for each 3 by 3 neighbourhood as Golly indexes it, and the rule's name. */
export interface Rule {
  birth: Iterable<number>;
  survival: Iterable<number>;
  table?: Uint8Array;
  name?: string;
}

export const CONWAY: Rule = { birth: [3], survival: [2, 3] };

/** "B3/S23" */
export const ruleString = (r: Rule) => (r.table && r.name ? r.name : `B${[...r.birth].sort().join("")}/S${[...r.survival].sort().join("")}`);

function popcount(v: number) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export interface StepStats {
  births: number;
  deaths: number;
}

export class LifeWorld {
  tiles = new Map<number, Tile>();
  generation = 0;
  population = 0;
  /** births and deaths of the last step */
  last: StepStats = { births: 0, deaths: 0 };
  /** a tile with no live cell for this many generations is let go, and its heat with it */
  keepEmpty = 512;
  /** Golly's History or Super family over the rule, or none: a plain two-state world */
  family: Family | null = null;
  /** tiles holding a boundary (state 6) or a Super label: their cells and the boundary's neighbours change on their own */
  private special = new Set<Tile>();
  private stamp = 0;
  private bMask = 0;
  private sMask = 0;
  private conway = true;
  /** a rule that is not totalistic: each cell is looked up by its neighbourhood instead of its count */
  private table: Uint8Array | null = null;
  private ruleName: string | undefined;

  constructor(rule: Rule = CONWAY) {
    this.setRule(rule);
  }

  get rule(): { birth: number[]; survival: number[]; table?: Uint8Array; name?: string } {
    const bits = (m: number) => [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((n) => m & (1 << n));
    return { birth: bits(this.bMask), survival: bits(this.sMask), ...(this.table ? { table: this.table, name: this.ruleName } : {}) };
  }

  /** B0 is left out: a birth from nothing would fill the whole plane at once. */
  setRule(rule: Rule) {
    this.bMask = [...rule.birth].reduce((m, n) => (n >= 1 && n <= 8 ? m | (1 << n) : m), 0);
    this.sMask = [...rule.survival].reduce((m, n) => (n >= 0 && n <= 8 ? m | (1 << n) : m), 0);
    this.table = rule.table ?? null;
    this.ruleName = rule.table ? rule.name : undefined;
    this.conway = !this.table && this.bMask === 1 << 3 && this.sMask === ((1 << 2) | (1 << 3));
    // (a new rule can change what a quiet neighbourhood becomes)
    for (const t of this.tiles.values()) t.changed = true;
  }

  /**
   * Gives every cell a state of a family, or takes them away. Coming from none, a live cell is state 1; going to none, a
   * cell is alive or dead as its state is odd or even; from Super to History, its states map down as Golly's toHistory
   * maps them (a trail to 1 or 2, a no-trail cell to 1, a label to 0, the no-trail boundary to 3 and 4).
   */
  setFamily(family: Family | null) {
    if (family === this.family) return;
    const from = this.family;
    this.family = family;
    this.special.clear();
    for (const t of this.tiles.values()) {
      t.changed = true;
      if (!family) {
        t.state = undefined;
        continue;
      }
      if (!t.state || !from) {
        t.state = new Uint8Array(CELLS);
        for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if ((t.bits[y] >>> x) & 1) t.state[y * TILE + x] = 1;
      } else if (from === "Super" && family === "History")
        for (let i = 0; i < CELLS; i++) {
          const c = t.state[i];
          t.state[i] = c <= 6 ? c : c === 7 ? 3 : c === 8 ? 4 : c === 10 || c === 12 ? 2 : c & 1 ? 1 : 0;
        }
      this.markSpecial(t);
    }
  }

  /** whether a tile holds a cell that changes without a birth or a death of its own (a boundary, a Super label) */
  private markSpecial(t: Tile) {
    const st = t.state;
    let any = false;
    if (st && this.family) for (let i = 0; i < CELLS && !any; i++) any = st[i] === 6 || restless(this.family, st[i]);
    if (any) this.special.add(t);
    else this.special.delete(t);
  }

  /** how many dead cells carry a state (a family's history, marks, boundaries, labels): none in a plain world */
  markedCount(): number {
    let n = 0;
    for (const t of this.tiles.values()) {
      const st = t.state;
      if (!st) continue;
      for (let i = 0; i < CELLS; i++) if (st[i] && !(st[i] & 1)) n++;
    }
    return n;
  }

  /** a cell's state: in a plain world 1 or 0 */
  getState(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    const t = this.tiles.get(tileKey(Math.floor(x / TILE), Math.floor(y / TILE)));
    if (!t) return 0;
    const cx = x - t.tx * TILE,
      cy = y - t.ty * TILE;
    return t.state ? t.state[cy * TILE + cx] : (t.bits[cy] >>> cx) & 1;
  }

  /** Sets a cell's state in a world of a family: alive, in `color`, when it is odd. */
  setState(x: number, y: number, state: number, color = DEFAULT_COLOR) {
    if (!this.family) return this.set(x, y, state & 1 ? color : -1);
    x = Math.floor(x);
    y = Math.floor(y);
    if (Math.abs(x) > LIMIT || Math.abs(y) > LIMIT) return;
    this.set(x, y, state & 1 ? color : -1);
    const t = this.tile(Math.floor(x / TILE), Math.floor(y / TILE));
    t.state![(y - t.ty * TILE) * TILE + (x - t.tx * TILE)] = state;
    t.changed = true;
    if (state === 6 || restless(this.family, state)) this.special.add(t);
    else if (this.special.has(t)) this.markSpecial(t);
  }

  clear() {
    this.special.clear();
    this.tiles.clear();
    this.generation = 0;
    this.population = 0;
    this.last = { births: 0, deaths: 0 };
  }

  private tile(tx: number, ty: number): Tile {
    const k = tileKey(tx, ty);
    let t = this.tiles.get(k);
    if (!t) {
      t = {
        tx,
        ty,
        bits: new Int32Array(TILE),
        next: new Int32Array(TILE),
        color: new Uint32Array(CELLS),
        born: new Int32Array(CELLS),
        heat: new Uint32Array(CELLS),
        pop: 0,
        changed: true,
        lastLive: this.generation,
        mark: -1,
        state: this.family ? new Uint8Array(CELLS) : undefined,
      };
      this.tiles.set(k, t);
    }
    return t;
  }

  getTile(tx: number, ty: number) {
    return this.tiles.get(tileKey(tx, ty));
  }

  /** the cell's colour if it is alive, else -1 (a point between cells reads the cell it is in) */
  get(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    const t = this.tiles.get(tileKey(Math.floor(x / TILE), Math.floor(y / TILE)));
    if (!t) return -1;
    const cx = x - t.tx * TILE,
      cy = y - t.ty * TILE;
    return (t.bits[cy] >>> cx) & 1 ? t.color[cy * TILE + cx] : -1;
  }

  /** Sets a cell alive in a colour, or dead (color < 0). Outside the plane's limit, nothing. */
  set(x: number, y: number, color: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (Math.abs(x) > LIMIT || Math.abs(y) > LIMIT) return;
    const tx = Math.floor(x / TILE),
      ty = Math.floor(y / TILE);
    if (color < 0 && !this.tiles.has(tileKey(tx, ty))) return;
    const t = this.tile(tx, ty);
    const cx = x - tx * TILE,
      cy = y - ty * TILE,
      i = cy * TILE + cx;
    const was = (t.bits[cy] >>> cx) & 1;
    // (in a family, a cell drawn alive is state 1 unless it already lives in another, and one erased is 0)
    if (t.state) t.state[i] = color >= 0 ? (t.state[i] & 1 ? t.state[i] : 1) : 0;
    if (color >= 0) {
      t.color[i] = color;
      if (!was) {
        t.bits[cy] |= 1 << cx;
        t.born[i] = this.generation;
        t.pop++;
        this.population++;
      }
      t.lastLive = this.generation;
    } else if (was) {
      t.bits[cy] &= ~(1 << cx);
      t.heat[i] += this.generation - t.born[i];
      t.pop--;
      this.population--;
    }
    t.changed = true;
  }

  /** age in generations of a live cell (1 the generation it is born) */
  age(t: Tile, i: number) {
    return this.generation - t.born[i] + 1;
  }

  /** generations the cell has lived, in all its lives so far */
  heatOf(t: Tile, i: number) {
    const alive = (t.bits[i >> 5] >>> (i & 31)) & 1;
    return t.heat[i] + (alive ? this.generation - t.born[i] + 1 : 0);
  }

  /** One generation. */
  step(): StepStats {
    const tiles = this.tiles;
    // (the tiles to compute: every tile with a live cell, and an empty one beside a live edge)
    const work: Tile[] = [];
    const stamp = ++this.stamp;
    for (const t of tiles.values())
      if (t.pop) {
        t.mark = stamp;
        work.push(t);
      }
    const n = work.length;
    for (let w = 0; w < n; w++) {
      const t = work[w];
      const b = t.bits;
      let left = 0,
        right = 0;
      for (let y = 0; y < TILE; y++) {
        left |= b[y] & 1;
        right |= b[y] >>> 31;
      }
      const top = b[0],
        bot = b[TILE - 1];
      if (top) this.ensure(t.tx, t.ty - 1, work, stamp);
      if (bot) this.ensure(t.tx, t.ty + 1, work, stamp);
      if (left) this.ensure(t.tx - 1, t.ty, work, stamp);
      if (right) this.ensure(t.tx + 1, t.ty, work, stamp);
      if (top & 1) this.ensure(t.tx - 1, t.ty - 1, work, stamp);
      if (top >>> 31) this.ensure(t.tx + 1, t.ty - 1, work, stamp);
      if (bot & 1) this.ensure(t.tx - 1, t.ty + 1, work, stamp);
      if (bot >>> 31) this.ensure(t.tx + 1, t.ty + 1, work, stamp);
    }

    // (each tile's next bits, from its own and its eight neighbours')
    const quiet = new Uint8Array(work.length);
    for (let w = 0; w < work.length; w++) {
      const t = work[w];
      const N = this.getTile(t.tx, t.ty - 1),
        S = this.getTile(t.tx, t.ty + 1),
        W = this.getTile(t.tx - 1, t.ty),
        E = this.getTile(t.tx + 1, t.ty),
        NW = this.getTile(t.tx - 1, t.ty - 1),
        NE = this.getTile(t.tx + 1, t.ty - 1),
        SW = this.getTile(t.tx - 1, t.ty + 1),
        SE = this.getTile(t.tx + 1, t.ty + 1);
      // nothing in its neighbourhood changed last step: what follows is what is
      if (!t.changed && !N?.changed && !S?.changed && !W?.changed && !E?.changed && !NW?.changed && !NE?.changed && !SW?.changed && !SE?.changed) {
        quiet[w] = 1;
        continue;
      }
      this.compute(t, N, S, W, E, NW, NE, SW, SE);
    }

    if (this.family) this.stepStates(work, quiet);

    // (births take their parents' colours, read before anything changes; deaths keep the generations they lived)
    const g = this.generation + 1;
    let births = 0,
      deaths = 0;
    for (let w = 0; w < work.length; w++) {
      if (quiet[w]) continue;
      const t = work[w];
      for (let y = 0; y < TILE; y++) {
        const cur = t.bits[y],
          nx = t.next[y];
        let born = nx & ~cur,
          died = cur & ~nx;
        while (born) {
          const x = 31 - Math.clz32(born & -born);
          born &= born - 1;
          const i = y * TILE + x;
          t.color[i] = this.parentColor(t, x, y);
          t.born[i] = g;
          births++;
        }
        while (died) {
          const x = 31 - Math.clz32(died & -died);
          died &= died - 1;
          const i = y * TILE + x;
          t.heat[i] += g - t.born[i];
          deaths++;
        }
      }
    }

    // (the new generation)
    let pop = 0;
    for (let w = 0; w < work.length; w++) {
      const t = work[w];
      if (quiet[w]) {
        t.changed = false;
        pop += t.pop;
        if (t.pop) t.lastLive = g;
        continue;
      }
      let changed = false,
        p = 0;
      for (let y = 0; y < TILE; y++) {
        if (t.bits[y] !== t.next[y]) changed = true;
        t.bits[y] = t.next[y];
        if (t.bits[y]) p += popcount(t.bits[y]);
      }
      t.changed = changed;
      t.pop = p;
      if (p) t.lastLive = g;
      pop += p;
    }
    // (a tile outside the work did not step, so nothing in it changed; one empty for long goes)
    for (const [k, t] of tiles) {
      if (t.mark !== stamp) t.changed = false;
      if (!t.pop && g - t.lastLive > this.keepEmpty) {
        // (a tile of a family's dead marks, its history, its labels, is kept as long as they are there)
        if (t.state && t.state.some((c) => c !== 0)) t.lastLive = g;
        else {
          tiles.delete(k);
          this.special.delete(t);
        }
      }
    }
    this.generation = g;
    this.population = pop;
    this.last = { births, deaths };
    return this.last;
  }

  /**
   * A family's states one generation on, before the new bits are taken: every cell that is born or dies, every cell
   * beside a boundary and every Super label gets the state Golly gives it (./super.ts, from the states around it as they
   * were), and its bit in `next` follows its new state, so a boundary turns off the live cells it touches and is never
   * born itself. Every other cell keeps its state: only the base rule moved its bit, and it did not.
   */
  private stepStates(work: Tile[], quiet: Uint8Array) {
    const family = this.family!;
    const inWork = new Map<Tile, number>();
    for (let w = 0; w < work.length; w++) {
      inWork.set(work[w], w);
      // (a quiet tile's next generation is the one it has)
      if (quiet[w]) work[w].next.set(work[w].bits);
    }
    const look = new Map<Tile, Uint8Array>();
    const want = (t: Tile, i: number) => {
      let m = look.get(t);
      if (!m) look.set(t, (m = new Uint8Array(CELLS)));
      m[i] = 1;
    };
    for (let w = 0; w < work.length; w++) {
      const t = work[w];
      for (let y = 0; y < TILE; y++) {
        let d = t.bits[y] ^ t.next[y];
        while (d) {
          const x = 31 - Math.clz32(d & -d);
          d &= d - 1;
          want(t, y * TILE + x);
        }
      }
    }
    for (const t of this.special) {
      const st = t.state!;
      for (let i = 0; i < CELLS; i++) {
        const c = st[i];
        if (restless(family, c)) want(t, i);
        if (c !== 6) continue;
        const x = t.tx * TILE + (i % TILE),
          y = t.ty * TILE + ((i / TILE) | 0);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx,
              ny = y + dy;
            const nt = this.tiles.get(tileKey(Math.floor(nx / TILE), Math.floor(ny / TILE)));
            if (nt) want(nt, (ny - nt.ty * TILE) * TILE + (nx - nt.tx * TILE));
          }
      }
    }
    // (every new state from the old ones, then all of them written)
    const out: [Tile, number, number][] = [];
    for (const [t, m] of look) {
      const st = t.state!;
      const w = inWork.get(t);
      for (let i = 0; i < CELLS; i++) {
        if (!m[i]) continue;
        const cx = i % TILE,
          cy = (i / TILE) | 0;
        const alive = w !== undefined && ((t.next[cy] >>> cx) & 1) === 1;
        const s = nextState(family, st[i], this.typeMask(t, cx, cy), alive);
        if (s !== st[i] || (s & 1) !== +alive) out.push([t, i, s]);
      }
    }
    const touched = new Set<Tile>();
    for (const [t, i, s] of out) {
      t.state![i] = s;
      const cx = i % TILE,
        cy = (i / TILE) | 0;
      const w = inWork.get(t);
      if (w !== undefined) {
        if (s & 1) t.next[cy] |= 1 << cx;
        else t.next[cy] &= ~(1 << cx);
        if (quiet[w] && t.next[cy] !== t.bits[cy]) quiet[w] = 0;
      }
      if (this.special.has(t)) touched.add(t);
    }
    for (const t of touched) this.markSpecial(t);
  }

  /** a bit set for the state of each of a cell's eight neighbours (Golly's typeMask) */
  private typeMask(t: Tile, cx: number, cy: number): number {
    let mask = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        let x = cx + dx,
          y = cy + dy,
          tt: Tile | undefined = t;
        if (x < 0 || x >= TILE || y < 0 || y >= TILE) {
          const ox = x < 0 ? -1 : x >= TILE ? 1 : 0,
            oy = y < 0 ? -1 : y >= TILE ? 1 : 0;
          tt = this.getTile(t.tx + ox, t.ty + oy);
          x -= ox * TILE;
          y -= oy * TILE;
        }
        mask |= 1 << (tt?.state ? tt.state[y * TILE + x] : 0);
      }
    return mask;
  }

  private ensure(tx: number, ty: number, work: Tile[], stamp: number) {
    if (Math.abs(tx) >= OFF - 1 || Math.abs(ty) >= OFF - 1) return;
    const t = this.tile(tx, ty);
    if (t.mark === stamp) return;
    t.mark = stamp;
    work.push(t);
  }

  private compute(t: Tile, N?: Tile, S?: Tile, W?: Tile, E?: Tile, NW?: Tile, NE?: Tile, SW?: Tile, SE?: Tile) {
    const b = t.bits,
      out = t.next;
    const wb = W?.bits,
      eb = E?.bits;
    const conway = this.conway,
      table = this.table,
      bm = this.bMask,
      sm = this.sMask;
    for (let y = 0; y < TILE; y++) {
      // the rows above, at and below, each with its west and east neighbours' bits shifted in
      let u: number, uw: number, ue: number;
      if (y > 0) {
        u = b[y - 1];
        uw = wb ? wb[y - 1] : 0;
        ue = eb ? eb[y - 1] : 0;
      } else {
        u = N ? N.bits[TILE - 1] : 0;
        uw = NW ? NW.bits[TILE - 1] : 0;
        ue = NE ? NE.bits[TILE - 1] : 0;
      }
      let d: number, dw: number, de: number;
      if (y < TILE - 1) {
        d = b[y + 1];
        dw = wb ? wb[y + 1] : 0;
        de = eb ? eb[y + 1] : 0;
      } else {
        d = S ? S.bits[0] : 0;
        dw = SW ? SW.bits[0] : 0;
        de = SE ? SE.bits[0] : 0;
      }
      const m = b[y],
        mw = wb ? wb[y] : 0,
        me = eb ? eb[y] : 0;
      const a1 = (u << 1) | (uw >>> 31),
        a2 = u,
        a3 = (u >>> 1) | (ue << 31);
      const b1 = (m << 1) | (mw >>> 31),
        b3 = (m >>> 1) | (me << 31);
      const c1 = (d << 1) | (dw >>> 31),
        c2 = d,
        c3 = (d >>> 1) | (de << 31);
      if (table) {
        // (a rule that is not totalistic: each cell with anything around it looked up by its neighbourhood, nw the
        // highest bit and se the lowest, as Golly indexes it; nothing around is dead, as a rule without B0 has it)
        let any = a1 | a2 | a3 | b1 | m | b3 | c1 | c2 | c3,
          o = 0;
        while (any) {
          const x = 31 - Math.clz32(any & -any);
          any &= any - 1;
          const idx =
            (((a1 >>> x) & 1) << 8) | (((a2 >>> x) & 1) << 7) | (((a3 >>> x) & 1) << 6) | (((b1 >>> x) & 1) << 5) | (((m >>> x) & 1) << 4) | (((b3 >>> x) & 1) << 3) | (((c1 >>> x) & 1) << 2) | (((c2 >>> x) & 1) << 1) | ((c3 >>> x) & 1);
          if (table[idx]) o |= 1 << x;
        }
        out[y] = o;
        continue;
      }
      // (the eight bits of each column added: ones, twos, fours and eights)
      const s1 = a1 ^ a2 ^ a3,
        k1 = (a1 & a2) | (a3 & (a1 ^ a2));
      const s2 = b1 ^ b3,
        k2 = b1 & b3;
      const s3 = c1 ^ c2 ^ c3,
        k3 = (c1 & c2) | (c3 & (c1 ^ c2));
      const ones = s1 ^ s2 ^ s3,
        kOnes = (s1 & s2) | (s3 & (s1 ^ s2));
      const t2 = k1 ^ k2 ^ k3,
        kt = (k1 & k2) | (k3 & (k1 ^ k2));
      const twos = t2 ^ kOnes,
        k4 = t2 & kOnes;
      const fours = kt ^ k4,
        eights = kt & k4;
      if (conway) {
        out[y] = twos & ~fours & ~eights & (ones | m);
        continue;
      }
      let born = 0,
        live = 0;
      for (let c = 0; c <= 8; c++) {
        const inB = (bm >> c) & 1,
          inS = (sm >> c) & 1;
        if (!inB && !inS) continue;
        const eq = (c & 1 ? ones : ~ones) & (c & 2 ? twos : ~twos) & (c & 4 ? fours : ~fours) & (c & 8 ? eights : ~eights);
        if (inB) born |= eq;
        if (inS) live |= eq;
      }
      out[y] = (born & ~m) | (live & m);
    }
  }

  /** a newborn's colour: the average of the live cells around it (the generation before) */
  private parentColor(t: Tile, x: number, y: number) {
    let r = 0,
      gr = 0,
      bl = 0,
      n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        let cx = x + dx,
          cy = y + dy,
          tt: Tile | undefined = t;
        if (cx < 0 || cx >= TILE || cy < 0 || cy >= TILE) {
          const ox = cx < 0 ? -1 : cx >= TILE ? 1 : 0,
            oy = cy < 0 ? -1 : cy >= TILE ? 1 : 0;
          tt = this.getTile(t.tx + ox, t.ty + oy);
          if (!tt) continue;
          cx -= ox * TILE;
          cy -= oy * TILE;
        }
        if ((tt.bits[cy] >>> cx) & 1) {
          const c = tt.color[cy * TILE + cx];
          r += c >>> 16;
          gr += (c >>> 8) & 255;
          bl += c & 255;
          n++;
        }
      }
    if (!n) return DEFAULT_COLOR;
    return (Math.round(r / n) << 16) | (Math.round(gr / n) << 8) | Math.round(bl / n);
  }

  /** Every live cell, in no particular order. */
  *cells(): Generator<[number, number, number]> {
    for (const t of this.tiles.values()) {
      if (!t.pop) continue;
      for (let y = 0; y < TILE; y++) {
        let row = t.bits[y];
        while (row) {
          const x = 31 - Math.clz32(row & -row);
          row &= row - 1;
          yield [t.tx * TILE + x, t.ty * TILE + y, t.color[y * TILE + x]];
        }
      }
    }
  }

  /** the tiles over a box: looked up one by one, or, for a box with more tiles in it than the world has, all walked */
  private *tilesIn(x0: number, y0: number, x1: number, y1: number): Generator<Tile> {
    const tx0 = Math.floor(x0 / TILE),
      ty0 = Math.floor(y0 / TILE),
      tx1 = Math.floor(x1 / TILE),
      ty1 = Math.floor(y1 / TILE);
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > this.tiles.size * 2) {
      for (const t of this.tiles.values()) if (t.tx >= tx0 && t.tx <= tx1 && t.ty >= ty0 && t.ty <= ty1) yield t;
      return;
    }
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.getTile(tx, ty);
        if (t) yield t;
      }
  }

  /** The smallest box holding every live cell, or null when there is none. */
  bounds(): { x0: number; y0: number; x1: number; y1: number } | null {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const t of this.tiles.values()) {
      if (t.state) {
        // (a family's dead marks count, as Golly fits them)
        for (let i = 0; i < TILE * TILE; i++) {
          if (!t.state[i]) continue;
          const gx = t.tx * TILE + (i % TILE),
            gy = t.ty * TILE + ((i / TILE) | 0);
          if (gx < x0) x0 = gx;
          if (gx > x1) x1 = gx;
          if (gy < y0) y0 = gy;
          if (gy > y1) y1 = gy;
        }
        continue;
      }
      if (!t.pop) continue;
      let cols = 0;
      for (let y = 0; y < TILE; y++)
        if (t.bits[y]) {
          cols |= t.bits[y];
          const gy = t.ty * TILE + y;
          if (gy < y0) y0 = gy;
          if (gy > y1) y1 = gy;
        }
      const lo = 31 - Math.clz32(cols & -cols),
        hi = 31 - Math.clz32(cols);
      if (t.tx * TILE + lo < x0) x0 = t.tx * TILE + lo;
      if (t.tx * TILE + hi > x1) x1 = t.tx * TILE + hi;
    }
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
  }

  /** The live cells in a box, as [x, y, colour] (for copying a selection, and for tests). */
  /** The live cells of the tiles a box touches: at least those in the box, exactly them when it is tile-aligned, and
   *  cheap however many there are (no cell is visited, only the tiles' counts). */
  popIn(x0: number, y0: number, x1: number, y1: number): number {
    const tx0 = Math.floor(x0 / TILE),
      ty0 = Math.floor(y0 / TILE),
      tx1 = Math.floor(x1 / TILE),
      ty1 = Math.floor(y1 / TILE);
    let n = 0;
    // (few tiles in the box: look each up; many: walk the world's tiles instead)
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= this.tiles.size * 2) {
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) n += this.getTile(tx, ty)?.pop ?? 0;
    } else for (const t of this.tiles.values()) if (t.tx >= tx0 && t.tx <= tx1 && t.ty >= ty0 && t.ty <= ty1) n += t.pop;
    return n;
  }

  cellsIn(x0: number, y0: number, x1: number, y1: number): [number, number, number][] {
    const out: [number, number, number][] = [];
    for (const t of this.tilesIn(x0, y0, x1, y1)) {
      if (!t.pop) continue;
      for (let y = 0; y < TILE; y++) {
        const gy = t.ty * TILE + y;
        if (gy < y0 || gy > y1) continue;
        let row = t.bits[y];
        while (row) {
          const x = 31 - Math.clz32(row & -row);
          row &= row - 1;
          const gx = t.tx * TILE + x;
          if (gx >= x0 && gx <= x1) out.push([gx, gy, t.color[y * TILE + x]]);
        }
      }
    }
    return out;
  }
}

/** where every live cell is, as a number: each tile's rows mixed with where the tile is, added up in any order */
export function digest(w: LifeWorld): number {
  let sum = 0;
  for (const t of w.tiles.values()) {
    if (!t.pop) continue;
    let h = Math.imul(t.tx, 0x9e3779b1) ^ Math.imul(t.ty, 0x85ebca77);
    for (let y = 0; y < 32; y++) h = Math.imul(h ^ t.bits[y], 0x01000193) + y;
    sum = (sum + (h ^ (h >>> 15))) | 0;
  }
  return sum;
}
