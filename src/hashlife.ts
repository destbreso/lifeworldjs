// Hashlife: Gosper's HashLife for Life-like rules. The plane is a quadtree whose nodes are made once each (the same
// square of cells is the same node wherever and whenever it appears), and a node remembers what its centre becomes
// 2^j generations on, so a pattern that repeats in space or time is stepped thousands or millions of generations at
// once. A cell is alive or not: no colours, no states. The tests hold it to LifeWorld, cell for cell.

import type { Rule } from "./tiled";

export interface HNode {
  /** 2^level cells a side; level 0 is one cell */
  level: number;
  nw: HNode;
  ne: HNode;
  sw: HNode;
  se: HNode;
  /** live cells in it (a number: up to 2^53) */
  pop: number;
  id: number;
  /** its centre 2^j generations on, by j */
  res?: (HNode | undefined)[];
}

export class Hashlife {
  private table = new Map<number, HNode | HNode[]>();
  private nextId = 2;
  readonly dead: HNode;
  readonly alive: HNode;
  /** the empty node of each level */
  private empties: HNode[] = [];
  private bMask = 0;
  private sMask = 0;
  /** a rule that is not totalistic (./rules.ts): next by neighbourhood, Golly's index */
  private ruleTable: Uint8Array | null = null;
  root: HNode;
  /** the world point at the root's centre is (0, 0); the generation it is at */
  generation = 0;
  /** nodes made since the last collection; past `limit` the table is rebuilt from what the root still uses */
  limit = 4_000_000;

  constructor(rule: Rule = { birth: [3], survival: [2, 3] }) {
    const leaf = (alive: boolean, id: number): HNode => {
      const n = { level: 0, pop: alive ? 1 : 0, id } as HNode;
      n.nw = n.ne = n.sw = n.se = n;
      return n;
    };
    this.dead = leaf(false, 0);
    this.alive = leaf(true, 1);
    this.empties[0] = this.dead;
    this.setRule(rule);
    this.root = this.empty(3);
  }

  setRule(rule: Rule) {
    this.bMask = [...rule.birth].reduce((m, n) => (n >= 1 && n <= 8 ? m | (1 << n) : m), 0);
    this.sMask = [...rule.survival].reduce((m, n) => (n >= 0 && n <= 8 ? m | (1 << n) : m), 0);
    this.ruleTable = rule.table ?? null;
    // every remembered future was under the old rule
    this.forget();
  }

  get population() {
    return this.root.pop;
  }

  get nodes() {
    return this.nextId;
  }

  /** the one node with these four children */
  node(nw: HNode, ne: HNode, sw: HNode, se: HNode): HNode {
    const h = (Math.imul(nw.id, 0x9e3779b1) ^ Math.imul(ne.id, 0x85ebca77) ^ Math.imul(sw.id, 0xc2b2ae3d) ^ Math.imul(se.id, 0x27d4eb2f)) | 0;
    const got = this.table.get(h);
    if (got) {
      if (!Array.isArray(got)) {
        if (got.nw === nw && got.ne === ne && got.sw === sw && got.se === se) return got;
      } else for (const n of got) if (n.nw === nw && n.ne === ne && n.sw === sw && n.se === se) return n;
    }
    const n: HNode = { level: nw.level + 1, nw, ne, sw, se, pop: nw.pop + ne.pop + sw.pop + se.pop, id: this.nextId++ };
    if (!got) this.table.set(h, n);
    else if (Array.isArray(got)) got.push(n);
    else this.table.set(h, [got, n]);
    return n;
  }

  empty(level: number): HNode {
    for (let l = this.empties.length; l <= level; l++) {
      const e = this.empties[l - 1];
      this.empties[l] = this.node(e, e, e, e);
    }
    return this.empties[level];
  }

  /** the node one level up with this one in its centre */
  expand(n: HNode): HNode {
    const e = this.empty(n.level - 1);
    return this.node(this.node(e, e, e, n.nw), this.node(e, e, n.ne, e), this.node(e, n.sw, e, e), this.node(n.se, e, e, e));
  }

  // ── cells in and out ──

  clear() {
    this.table.clear();
    this.empties = [this.dead];
    this.nextId = 2;
    this.root = this.empty(3);
    this.generation = 0;
  }

  /** Sets cells alive, all at once (a fresh plane). */
  load(cells: Iterable<[number, number]>) {
    const list = [...cells];
    this.clear();
    let r = 0;
    for (const [x, y] of list) r = Math.max(r, Math.abs(x) + 1, Math.abs(y) + 1);
    let level = 3;
    while (1 << (level - 1) < r) level++;
    this.root = this.build(list, level, -(1 << (level - 1)), -(1 << (level - 1)));
  }

  private build(cells: [number, number][], level: number, x0: number, y0: number): HNode {
    if (!cells.length) return this.empty(level);
    if (level === 0) return this.alive;
    const h = 1 << (level - 1);
    const q: [number, number][][] = [[], [], [], []];
    for (const c of cells) q[(c[1] >= y0 + h ? 2 : 0) + (c[0] >= x0 + h ? 1 : 0)].push(c);
    return this.node(this.build(q[0], level - 1, x0, y0), this.build(q[1], level - 1, x0 + h, y0), this.build(q[2], level - 1, x0, y0 + h), this.build(q[3], level - 1, x0 + h, y0 + h));
  }

  /** Sets one cell alive or dead (the plane grows to hold it). */
  set(x: number, y: number, alive: boolean) {
    x = Math.floor(x);
    y = Math.floor(y);
    let half = 2 ** (this.root.level - 1);
    while (x < -half || x >= half || y < -half || y >= half) {
      this.root = this.expand(this.root);
      half *= 2;
    }
    const put = (n: HNode, cx: number, cy: number): HNode => {
      if (n.level === 0) return alive ? this.alive : this.dead;
      const h = 2 ** (n.level - 1);
      const e = cx >= h,
        s = cy >= h;
      const nx = e ? cx - h : cx,
        ny = s ? cy - h : cy;
      return this.node(!e && !s ? put(n.nw, nx, ny) : n.nw, e && !s ? put(n.ne, nx, ny) : n.ne, !e && s ? put(n.sw, nx, ny) : n.sw, e && s ? put(n.se, nx, ny) : n.se);
    };
    this.root = put(this.root, x + half, y + half);
  }

  /** whether a cell is alive */
  get(x: number, y: number): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    const half = 2 ** (this.root.level - 1);
    if (x < -half || x >= half || y < -half || y >= half) return false;
    let n = this.root,
      cx = x + half,
      cy = y + half;
    while (n.level > 0) {
      if (!n.pop) return false;
      const h = 2 ** (n.level - 1);
      const e = cx >= h,
        s = cy >= h;
      n = e ? (s ? n.se : n.ne) : s ? n.sw : n.nw;
      if (e) cx -= h;
      if (s) cy -= h;
    }
    return n.pop > 0;
  }

  /** the live cells inside a box (all of them when no box) */
  cells(box?: { x0: number; y0: number; x1: number; y1: number }): [number, number][] {
    const out: [number, number][] = [];
    const half = this.root.level ? 2 ** (this.root.level - 1) : 0;
    const walk = (n: HNode, x: number, y: number) => {
      if (!n.pop) return;
      const size = 2 ** n.level;
      if (box && (x > box.x1 || y > box.y1 || x + size - 1 < box.x0 || y + size - 1 < box.y0)) return;
      if (n.level === 0) return void out.push([x, y]);
      const h = size / 2;
      walk(n.nw, x, y);
      walk(n.ne, x + h, y);
      walk(n.sw, x, y + h);
      walk(n.se, x + h, y + h);
    };
    walk(this.root, -half, -half);
    return out;
  }

  /** how many live cells a box holds, a node's own count taken whole where it lies inside (no cells listed) */
  count(box: { x0: number; y0: number; x1: number; y1: number }): number {
    const half = this.root.level ? 2 ** (this.root.level - 1) : 0;
    const walk = (n: HNode, x: number, y: number): number => {
      if (!n.pop) return 0;
      const size = 2 ** n.level;
      if (x > box.x1 || y > box.y1 || x + size - 1 < box.x0 || y + size - 1 < box.y0) return 0;
      if (x >= box.x0 && y >= box.y0 && x + size - 1 <= box.x1 && y + size - 1 <= box.y1) return n.pop;
      const h = size / 2;
      return walk(n.nw, x, y) + walk(n.ne, x + h, y) + walk(n.sw, x, y + h) + walk(n.se, x + h, y + h);
    };
    return walk(this.root, -half, -half);
  }

  /** Every node down to `minSize` cells across inside a box, with its corner: the renderer's way in at a distance. */
  visit(box: { x0: number; y0: number; x1: number; y1: number }, minSize: number, fn: (x: number, y: number, size: number, pop: number) => void) {
    const half = 2 ** (this.root.level - 1);
    const walk = (n: HNode, x: number, y: number) => {
      if (!n.pop) return;
      const size = 2 ** n.level;
      if (x > box.x1 || y > box.y1 || x + size - 1 < box.x0 || y + size - 1 < box.y0) return;
      if (size <= minSize || n.level === 0) return fn(x, y, size, n.pop);
      const h = size / 2;
      walk(n.nw, x, y);
      walk(n.ne, x + h, y);
      walk(n.sw, x, y + h);
      walk(n.se, x + h, y + h);
    };
    walk(this.root, -half, -half);
  }

  /** The smallest box holding every live cell, found by going only where the edges are. */
  bounds(): { x0: number; y0: number; x1: number; y1: number } | null {
    if (!this.root.pop) return null;
    const half = 2 ** (this.root.level - 1);
    // the least x of a live cell in a node, from its corner; memoised by node (the edge runs through shared subtrees)
    const memo = new Map<number, number>();
    const least = (n: HNode, flip: (m: HNode) => [HNode, HNode, HNode, HNode]): number => {
      if (n.level === 0) return 0;
      const got = memo.get(n.id);
      if (got !== undefined) return got;
      const [a, b, c, d] = flip(n); // (a, c the near half; b, d the far one)
      const h = 2 ** (n.level - 1);
      let r: number;
      if (a.pop || c.pop) r = Math.min(a.pop ? least(a, flip) : Infinity, c.pop ? least(c, flip) : Infinity);
      else r = h + Math.min(b.pop ? least(b, flip) : Infinity, d.pop ? least(d, flip) : Infinity);
      memo.set(n.id, r);
      return r;
    };
    const size = 2 ** this.root.level;
    const run = (flip: (m: HNode) => [HNode, HNode, HNode, HNode]) => {
      memo.clear();
      return least(this.root, flip);
    };
    const x0 = -half + run((m) => [m.nw, m.ne, m.sw, m.se]);
    const x1 = -half + size - 1 - run((m) => [m.ne, m.nw, m.se, m.sw]);
    const y0 = -half + run((m) => [m.nw, m.sw, m.ne, m.se]);
    const y1 = -half + size - 1 - run((m) => [m.sw, m.nw, m.se, m.ne]);
    return { x0, y0, x1, y1 };
  }

  // ── time ──

  /** a 4x4 node's centre one generation on */
  private base(n: HNode): HNode {
    // the 16 cells as bits, row by row from the top-left
    let bits = 0;
    const quad = (q: HNode, ox: number, oy: number) => {
      if (q.nw.pop) bits |= 1 << (oy * 4 + ox);
      if (q.ne.pop) bits |= 1 << (oy * 4 + ox + 1);
      if (q.sw.pop) bits |= 1 << ((oy + 1) * 4 + ox);
      if (q.se.pop) bits |= 1 << ((oy + 1) * 4 + ox + 1);
    };
    quad(n.nw, 0, 0);
    quad(n.ne, 2, 0);
    quad(n.sw, 0, 2);
    quad(n.se, 2, 2);
    const table = this.ruleTable;
    const cell = (x: number, y: number) => {
      if (table) {
        let idx = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) idx = (idx << 1) | ((bits >> ((y + dy) * 4 + x + dx)) & 1);
        return table[idx] ? this.alive : this.dead;
      }
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && (bits >> ((y + dy) * 4 + x + dx)) & 1) c++;
      const alive = (bits >> (y * 4 + x)) & 1;
      return (alive ? (this.sMask >> c) & 1 : (this.bMask >> c) & 1) ? this.alive : this.dead;
    };
    return this.node(cell(1, 1), cell(2, 1), cell(1, 2), cell(2, 2));
  }

  /** a node's centre (one level down), now */
  private centre(n: HNode): HNode {
    return this.node(n.nw.se, n.ne.sw, n.sw.ne, n.se.nw);
  }

  /** A node's centre (one level down) 2^j generations on, 0 <= j <= level - 2. */
  successor(n: HNode, j: number): HNode {
    if (!n.pop) return this.empty(n.level - 1);
    const cached = n.res?.[j];
    if (cached) return cached;
    let r: HNode;
    if (n.level === 2) r = this.base(n);
    else {
      const k = n.level;
      // the nine overlapping squares of half its size
      const n00 = n.nw,
        n01 = this.node(n.nw.ne, n.ne.nw, n.nw.se, n.ne.sw),
        n02 = n.ne,
        n10 = this.node(n.nw.sw, n.nw.se, n.sw.nw, n.sw.ne),
        n11 = this.node(n.nw.se, n.ne.sw, n.sw.ne, n.se.nw),
        n12 = this.node(n.ne.sw, n.ne.se, n.se.nw, n.se.ne),
        n20 = n.sw,
        n21 = this.node(n.sw.ne, n.se.nw, n.sw.se, n.se.sw),
        n22 = n.se;
      // the whole leap in two halves; or, a shorter leap, the first half only centres and the second leaps
      const full = j === k - 2;
      const a = (m: HNode) => (full ? this.successor(m, k - 3) : this.centre(m));
      const c00 = a(n00),
        c01 = a(n01),
        c02 = a(n02),
        c10 = a(n10),
        c11 = a(n11),
        c12 = a(n12),
        c20 = a(n20),
        c21 = a(n21),
        c22 = a(n22);
      const jj = full ? k - 3 : j;
      r = this.node(
        this.successor(this.node(c00, c01, c10, c11), jj),
        this.successor(this.node(c01, c02, c11, c12), jj),
        this.successor(this.node(c10, c11, c20, c21), jj),
        this.successor(this.node(c11, c12, c21, c22), jj),
      );
    }
    (n.res ??= [])[j] = r;
    return r;
  }

  /** Steps the plane 2^j generations. */
  step(j = 0) {
    // room around the pattern, so the centre after the leap holds all of it: two levels more than the leap, and an
    // empty border
    let r = this.root;
    while (r.level < j + 3) r = this.expand(r);
    while (!this.bordersEmpty(r)) r = this.expand(r);
    r = this.expand(r);
    this.root = this.successor(r, j);
    this.generation += 2 ** j;
    if (this.nextId > this.limit) this.collect();
  }

  /** whether a node's outer ring (all but its centre quarter... its centre half) is empty */
  private bordersEmpty(n: HNode) {
    const inner = n.nw.se.pop + n.ne.sw.pop + n.sw.ne.pop + n.se.nw.pop;
    return n.level > 2 && inner === n.pop;
  }

  /** forgets every remembered future (a new rule) */
  private forget() {
    for (const v of this.table.values()) for (const n of Array.isArray(v) ? v : [v]) n.res = undefined;
  }

  /** Rebuilds the table from the nodes the root still uses; everything else (and every remembered future) goes. */
  collect() {
    const level = this.root.level;
    const half = 2 ** (level - 1);
    // cheapest to rebuild: the cells, when they are few; else the tree, node by node. They are a new array, used as
    // they are: spread into a push, hundreds of thousands of them overflowed the stack
    const cells = this.root.pop <= 2_000_000 ? this.cells() : null;
    if (cells) {
      const g = this.generation;
      this.table.clear();
      this.empties = [this.dead];
      this.nextId = 2;
      this.root = this.build(cells, level, -half, -half);
      this.generation = g;
      return;
    }
    const old = this.root;
    this.table.clear();
    this.empties = [this.dead];
    this.nextId = 2;
    // each node copied once: the tree shares its subtrees, and copying them each time they appear would never end
    const done = new Map<number, HNode>();
    const copy = (n: HNode): HNode => {
      if (n.level === 0) return n;
      let c = done.get(n.id);
      if (!c) done.set(n.id, (c = this.node(copy(n.nw), copy(n.ne), copy(n.sw), copy(n.se))));
      return c;
    };
    this.root = copy(old);
  }
}
