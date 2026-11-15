import { describe, expect, it } from "vitest";
import { splitmix32 } from "./rng";
import { CONWAY, LifeWorld, TILE, ruleString } from "../src/core/tiled";

describe("popIn", () => {
  it("counts the live cells of the tiles a box touches: exactly in a tile-aligned box, at least those in any other", () => {
    const w = new LifeWorld();
    for (let i = 0; i < 500; i++) w.set((i * 37) % 300 - 150, (i * 91) % 300 - 150, 1);
    expect(w.popIn(-1e6, -1e6, 1e6, 1e6)).toBe(w.population);
    expect(w.popIn(0, 0, TILE * 2 - 1, TILE * 2 - 1)).toBe(w.cellsIn(0, 0, TILE * 2 - 1, TILE * 2 - 1).length);
    for (const [x0, y0, x1, y1] of [[-7, 3, 40, 90], [10, -100, 11, 100], [-150, -150, -140, -140]]) expect(w.popIn(x0, y0, x1, y1)).toBeGreaterThanOrEqual(w.cellsIn(x0, y0, x1, y1).length);
  });
});

// The oracle: the sparse stepper destbreso.com's Game of Life used before this engine (stepSparse and mixColorHex),
// copied as it was but for its age and heat maps, which the engine keeps another way.
type CellMap = Map<string, string>;
const ck = (r: number, c: number) => `${r},${c}`;
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mixColorHex(colors: string[]): string {
  if (!colors.length) return "#22d3ee";
  let r = 0,
    g = 0,
    b = 0;
  for (const c of colors) {
    const [cr, cg, cb] = hexToRgb(c);
    r += cr;
    g += cg;
    b += cb;
  }
  const n = colors.length;
  return `#${Math.round(r / n)
    .toString(16)
    .padStart(2, "0")}${Math.round(g / n)
    .toString(16)
    .padStart(2, "0")}${Math.round(b / n)
    .toString(16)
    .padStart(2, "0")}`;
}
function stepSparse(alive: CellMap, birth: Set<number>, survival: Set<number>) {
  const nbCount = new Map<string, number>();
  const nbColors = new Map<string, string[]>();
  for (const [key, color] of alive) {
    const i = key.indexOf(",");
    const r = +key.slice(0, i),
      c = +key.slice(i + 1);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nk = ck(r + dr, c + dc);
        nbCount.set(nk, (nbCount.get(nk) ?? 0) + 1);
        const nc = nbColors.get(nk);
        if (nc) nc.push(color);
        else nbColors.set(nk, [color]);
      }
    }
  }
  for (const key of alive.keys()) if (!nbCount.has(key)) nbCount.set(key, 0);
  const newAlive: CellMap = new Map();
  let births = 0,
    deaths = 0;
  for (const [key, count] of nbCount) {
    const wasAlive = alive.has(key);
    if (wasAlive) {
      if (survival.has(count)) newAlive.set(key, alive.get(key)!);
      else deaths++;
    } else if (birth.has(count)) {
      const nc = nbColors.get(key) ?? [];
      newAlive.set(key, nc.length ? mixColorHex(nc) : "#22d3ee");
      births++;
    }
  }
  return { newAlive, births, deaths };
}

const PALETTE = ["#22d3ee", "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#3b82f6"];
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const toMap = (w: LifeWorld) => {
  const m: CellMap = new Map();
  for (const [x, y, c] of w.cells()) m.set(ck(y, x), hex(c));
  return m;
};
const sorted = (m: CellMap) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

/** a soup across tile edges and the origin, in the palette's colours */
function soup(seed: number, x0: number, y0: number, w: number, h: number, density = 0.35) {
  const rand = splitmix32(seed);
  const m: CellMap = new Map();
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (rand() < density) m.set(ck(y, x), PALETTE[Math.floor(rand() * PALETTE.length)]);
  return m;
}
function load(m: CellMap, rule = CONWAY) {
  const w = new LifeWorld(rule);
  for (const [k, c] of m) {
    const [r, col] = k.split(",").map(Number);
    w.set(col, r, parseInt(c.slice(1), 16));
  }
  return w;
}

const RULES: Record<string, { birth: number[]; survival: number[] }> = {
  conway: { birth: [3], survival: [2, 3] },
  highlife: { birth: [3, 6], survival: [2, 3] },
  daynight: { birth: [3, 6, 7, 8], survival: [3, 4, 6, 7, 8] },
  maze: { birth: [3], survival: [1, 2, 3, 4, 5] },
  seeds: { birth: [2], survival: [] },
  lwod: { birth: [3], survival: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
  coral: { birth: [3], survival: [4, 5, 6, 7, 8] },
  amoeba: { birth: [3, 5, 7], survival: [1, 3, 5, 8] },
  b36s125: { birth: [3, 6], survival: [1, 2, 5] },
};

describe("tiled Life", () => {
  for (const [name, rule] of Object.entries(RULES)) {
    it(`steps ${name} (${ruleString(rule)}) exactly as the sparse stepper did, colours and counts included`, () => {
      let ref = soup(name.length * 7919, -45, -40, 90, 80);
      const w = load(ref, rule);
      const B = new Set(rule.birth),
        S = new Set(rule.survival);
      const gens = name === "seeds" || name === "lwod" ? 12 : 60;
      for (let g = 0; g < gens; g++) {
        const r = stepSparse(ref, B, S);
        const s = w.step();
        ref = r.newAlive;
        expect(s).toEqual({ births: r.births, deaths: r.deaths });
        expect(w.population).toBe(ref.size);
      }
      expect(sorted(toMap(w))).toEqual(sorted(ref));
    });
  }

  it("runs a glider across many tiles and back to its shape, 4 generations a cell", () => {
    const w = new LifeWorld();
    for (const [x, y] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) w.set(x, y, 0xffffff);
    for (let g = 0; g < 4 * 300; g++) w.step();
    expect(w.population).toBe(5);
    expect(w.bounds()).toEqual({ x0: 300, y0: 300, x1: 302, y1: 302 });
    // the tiles it left behind empty are let go
    expect(w.tiles.size).toBeLessThan(40);
  });

  it("skips quiet neighbourhoods without changing what happens", () => {
    // blocks and a glider aimed at one: the block tiles are quiet until the glider arrives
    let ref = new Map<string, string>();
    const put = (x: number, y: number, c = "#22c55e") => ref.set(ck(y, x), c);
    for (const [bx, by] of [[100, 100], [200, 30], [-70, 140]]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(bx + dx, by + dy);
    for (const [x, y] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) put(x + 80, y + 80, "#ef4444");
    const w = load(ref);
    const B = new Set([3]),
      S = new Set([2, 3]);
    for (let g = 0; g < 300; g++) {
      ref = stepSparse(ref, B, S).newAlive;
      w.step();
    }
    expect(sorted(toMap(w))).toEqual(sorted(ref));
  });

  it("keeps a cell's age and the generations it has lived", () => {
    const w = new LifeWorld();
    // a blinker: its middle cell lives on, its ends take turns
    for (const x of [0, 1, 2]) w.set(x, 5, 0x22d3ee);
    for (let g = 0; g < 10; g++) w.step();
    const t = w.getTile(0, 0)!;
    const mid = 5 * TILE + 1;
    expect(w.age(t, mid)).toBe(11);
    expect(w.heatOf(t, mid)).toBe(11);
    // an end cell (0,5) is alive every other generation: born at 10, after lives of 1 generation at 2, 4, 6 and 8
    const end = 5 * TILE + 0;
    expect(w.get(0, 5)).toBe(0x22d3ee);
    expect(w.age(t, end)).toBe(1);
    expect(w.heatOf(t, end)).toBe(1 /* painted, 0..1 */ + 4 + 1);
  });

  it("leaves B0 out, and edits wake a quiet tile", () => {
    const w = new LifeWorld({ birth: [0, 3], survival: [2, 3] });
    expect(w.rule.birth).toEqual([3]);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) w.set(10 + dx, 10 + dy, 1);
    for (let g = 0; g < 5; g++) w.step();
    expect(w.population).toBe(4);
    // a cell set beside the quiet block: the block's tile must step again
    w.set(12, 10, 1);
    let ref: CellMap = new Map();
    for (const [x, y] of [[10, 10], [11, 10], [10, 11], [11, 11], [12, 10]]) ref.set(ck(y, x), "#000001");
    for (let g = 0; g < 6; g++) {
      ref = stepSparse(ref, new Set([3]), new Set([2, 3])).newAlive;
      w.step();
      expect(sorted(toMap(w))).toEqual(sorted(ref));
    }
  });
});

describe("a box larger than the world", () => {
  it("lists its live cells by walking the world's tiles, not the box", () => {
    const w = new LifeWorld();
    w.set(5, 5, 1);
    w.set(-4000, 9000, 2);
    const t0 = performance.now();
    expect(w.cellsIn(-Infinity, -Infinity, Infinity, Infinity).map(([x, y]) => `${x},${y}`).sort()).toEqual(["-4000,9000", "5,5"]);
    expect(w.cellsIn(-1e9, -1e9, 1e9, 1e9)).toHaveLength(2);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
