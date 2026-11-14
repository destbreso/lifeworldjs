import { describe, expect, it } from "vitest";
import { HENSEL, mapOf, parseRule, type ParsedRule } from "../src/rules";
import { LifeWorld } from "../src/tiled";
import { Hashlife } from "../src/hashlife";
import { splitmix32 } from "./rng";

const ok = (r: string) => {
  const p = parseRule(r);
  if ("error" in p) throw new Error(`${r}: ${p.error}`);
  return p as ParsedRule;
};
const neighbours = (x: number) => {
  let n = 0;
  for (let m = x & 0x1ef; m; m &= m - 1) n++;
  return n;
};
/** Life's table, written out by its counts, independently of the reader */
const LIFE = Uint8Array.from({ length: 512 }, (_, x) => ((x & 0x10 ? neighbours(x) === 2 || neighbours(x) === 3 : neighbours(x) === 3) ? 1 : 0));
const LETTERS = [0, 2, 6, 10, 13, 10, 6, 2, 0];
const binom = (n: number, k: number): number => (k === 0 ? 1 : (binom(n - 1, k - 1) * n) / k);

describe("a rule as Golly writes it", () => {
  it("reads a totalistic rule in any of its forms as counts alone", () => {
    for (const r of ["B3/S23", "b3/s23", "B3S23", "S23/B3", "23/3", "Life"]) {
      const p = ok(r);
      expect(p, r).toMatchObject({ birth: [3], survival: [2, 3], name: "B3/S23" });
      expect(p.table, r).toBeUndefined();
    }
    expect(ok("B36/S23")).toMatchObject({ birth: [3, 6], survival: [2, 3] });
  });

  it("covers every shape of each count with its letters, once each", () => {
    for (let n = 1; n <= 7; n++) {
      const letters = HENSEL.slice(0, LETTERS[n]);
      // (all of a count's letters are the count itself)
      expect(ok(`B${n}${letters}/S`).table, `B${n}`).toEqual(ok(`B${n}c/S`).table!.map((_, x) => (!(x & 0x10) && neighbours(x) === n ? 1 : 0)));
      // (each letter its own shapes, none shared: they add up to the eight neighbours taken n at a time)
      let total = 0;
      const seen = new Uint8Array(512);
      for (const l of letters) {
        const t = ok(`B${n}${l}/S`).table!;
        for (let x = 0; x < 512; x++)
          if (t[x]) {
            expect(seen[x], `${n}${l} shares a neighbourhood`).toBe(0);
            seen[x] = 1;
            total++;
          }
      }
      expect(total).toBe(binom(8, n));
    }
  });

  it("writes Life with every letter as Life, takes letters away after a minus, and names the shapes as Hensel does", () => {
    expect(ok("B3cekainyqjr/S2cekain3cekainyqjr").table).toEqual(LIFE);
    const minus = ok("B2-a/S").table!,
      all = ok("B2cekain/S").table!,
      a = ok("B2a/S").table!;
    for (let x = 0; x < 512; x++) expect(minus[x]).toBe(all[x] && !a[x] ? 1 : 0);
    // (2c two corners of one side, 2e two sides at a corner, 2i two opposite sides, 2n two opposite corners)
    const at = (r: string, x: number) => ok(r).table![x];
    expect(at("B2c/S", 0b000000101)).toBe(1);
    expect(at("B2e/S", 0b010001000)).toBe(1);
    expect(at("B2i/S", 0b000101000)).toBe(1);
    expect(at("B2n/S", 0b001000100)).toBe(1);
    expect(at("B2c/S", 0b000101000)).toBe(0);
  });

  it("reads and writes a MAP rule as Golly does: Life's is the one quoted everywhere", () => {
    const map = "MAPARYXfhZofugWaH7oaIDogBZofuhogOiAaIDogIAAgAAWaH7oaIDogGiA6ICAAIAAaIDogIAAgACAAIAAAAAAAA";
    expect(mapOf(LIFE)).toBe(map);
    expect(ok(map).table).toEqual(LIFE);
    expect(ok(map + "==").table).toEqual(LIFE);
    expect(ok(map)).toMatchObject({ birth: [3], survival: [2, 3] });
  });

  it("reads the rule from the Discord, and refuses what the engines do not run, saying why", () => {
    const p = ok("B2e3air4k5ckn6n/S1c23-knqy4ery5ekn6a7c");
    expect(p.name).toBe("B2e3air4k5ckn6n/S1c23-knqy4ery5ekn6a7c");
    expect(p.birth).toEqual([2, 3, 4, 5, 6]);
    expect(p.survival).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const no = (r: string, why: RegExp) => expect((parseRule(r) as { error: string }).error, r).toMatch(why);
    no("B0/S8", /B0/);
    no("B3/S23:T100,100", /bounded grid/);
    no("23/3/2", /Generations/);
    no("B2/S34H", /hexagonal or von Neumann/);
    no("B2z/S", /no shape "z"/);
    no("B2-/S", /needs letters/);
    no("tlife", /not a rule/);
    no("MAPABC", /86 base64/);
  });
});

// ── The engines with a table ──

const live = (cells: Iterable<[number, number, ...unknown[]]>) => [...cells].map(([x, y]) => `${x},${y}`).sort().join(" ");
function soup(seed: number, w = 24): [number, number][] {
  const rand = splitmix32(seed);
  const out: [number, number][] = [];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (rand() < 0.35) out.push([x, y]);
  return out;
}

describe("the engines run a rule by its table", () => {
  it("Life written with every letter runs as Life's counts do, cell for cell", () => {
    const a = new LifeWorld(ok("B3cekainyqjr/S2cekain3cekainyqjr")),
      b = new LifeWorld();
    for (const [x, y] of soup(1)) (a.set(x, y, 1), b.set(x, y, 1));
    for (let g = 0; g < 300; g++) {
      a.step();
      b.step();
    }
    expect(live(a.cells())).toBe(live(b.cells()));
  });

  it("reads a neighbourhood the way Golly indexes it: west's bit moves a pattern east, north's moves it south", () => {
    for (const [bit, dx, dy] of [[5, 1, 0], [7, 0, 1], [3, -1, 0], [1, 0, -1]] as const) {
      const table = Uint8Array.from({ length: 512 }, (_, x) => (x >> bit) & 1);
      const w = new LifeWorld(ok(mapOf(table)));
      const cells = soup(2, 10);
      for (const [x, y] of cells) w.set(x, y, 1);
      for (let g = 0; g < 37; g++) w.step();
      expect(live(w.cells()), `bit ${bit}`).toBe(live(cells.map(([x, y]) => [x + 37 * dx, y + 37 * dy])));
    }
  });

  it("runs the Discord's rule as a plain reading of its table does, and HashLife leaps to the same board", () => {
    const rule = ok("B2e3air4k5ckn6n/S1c23-knqy4ery5ekn6a7c");
    const N = 200,
      O = 88;
    let g = new Uint8Array(N * N);
    for (const [x, y] of soup(3)) g[(y + O) * N + x + O] = 1;
    const w = new LifeWorld(rule);
    for (const [x, y] of soup(3)) w.set(x, y, 1);
    for (let gen = 1; gen <= 64; gen++) {
      const out = new Uint8Array(N * N);
      for (let y = 1; y < N - 1; y++)
        for (let x = 1; x < N - 1; x++) {
          let idx = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) idx = (idx << 1) | g[(y + dy) * N + x + dx];
          out[y * N + x] = rule.table![idx];
        }
      g = out;
      w.step();
    }
    const ref: [number, number][] = [];
    for (let i = 0; i < N * N; i++) if (g[i]) ref.push([(i % N) - O, Math.floor(i / N) - O]);
    // (the soup stays well inside the grid in 64 generations, so the two are the whole world)
    expect(live(w.cells())).toBe(live(ref));
    const h = new Hashlife(rule);
    h.load(soup(3));
    h.step(6);
    expect(h.generation).toBe(64);
    expect(live(h.cells())).toBe(live(ref));
  });
});
