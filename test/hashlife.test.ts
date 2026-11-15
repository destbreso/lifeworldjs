import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { splitmix32 } from "./rng";
import { parseRLE } from "../src/features/rle";
import { LifeWorld } from "../src/core/tiled";
import { Hashlife } from "../src/core/hashlife";

const key = (cells: Iterable<[number, number]>) => [...cells].map(([x, y]) => `${x},${y}`).sort();
function soup(seed: number, w: number, h: number, d = 0.35): [number, number][] {
  const r = splitmix32(seed);
  const out: [number, number][] = [];
  for (let y = -h / 2; y < h / 2; y++) for (let x = -w / 2; x < w / 2; x++) if (r() < d) out.push([x, y]);
  return out;
}
const tiledAfter = (cells: [number, number][], gens: number, rule = { birth: [3], survival: [2, 3] }) => {
  const w = new LifeWorld(rule);
  for (const [x, y] of cells) w.set(x, y, 1);
  for (let g = 0; g < gens; g++) w.step();
  return w;
};

describe("Hashlife", () => {
  it("steps one generation at a time exactly as the tiled engine", () => {
    const start = soup(3, 60, 50);
    const h = new Hashlife();
    h.load(start);
    const w = tiledAfter(start, 0);
    for (let g = 0; g < 80; g++) {
      h.step(0);
      w.step();
    }
    expect(key(h.cells())).toEqual(key([...w.cells()].map(([x, y]) => [x, y] as [number, number])));
    expect(h.generation).toBe(80);
  });

  it("leaps 2^j generations to the same place the tiled engine walks to", () => {
    for (const j of [1, 3, 5, 7]) {
      const start = soup(11 + j, 40, 40);
      const h = new Hashlife();
      h.load(start);
      h.step(j);
      h.step(j);
      const w = tiledAfter(start, 2 * 2 ** j);
      expect(key(h.cells())).toEqual(key([...w.cells()].map(([x, y]) => [x, y] as [number, number])));
      expect(h.population).toBe(w.population);
    }
  });

  it("counts the cells in a box as the cells it lists there", () => {
    const h = new Hashlife();
    h.load(soup(5, 300, 200));
    h.step(4);
    for (const box of [{ x0: -150, y0: -100, x1: 149, y1: 99 }, { x0: -37, y0: 11, x1: 64, y1: 12 }, { x0: 3, y0: -90, x1: 3, y1: 90 }, { x0: 500, y0: 500, x1: 600, y1: 600 }]) expect(h.count(box)).toBe(h.cells(box).length);
    expect(h.count({ x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 })).toBe(h.population);
  });

  it("follows other rules too", () => {
    for (const rule of [
      { birth: [3, 6], survival: [2, 3] },
      { birth: [3, 6, 7, 8], survival: [3, 4, 6, 7, 8] },
      { birth: [3], survival: [1, 2, 3, 4, 5] },
    ]) {
      const start = soup(5, 30, 30);
      const h = new Hashlife(rule);
      h.load(start);
      h.step(4);
      expect(key(h.cells())).toEqual(key([...tiledAfter(start, 16, rule).cells()].map(([x, y]) => [x, y] as [number, number])));
    }
  });

  it("sends a glider a million cells in one leap", () => {
    const h = new Hashlife();
    h.load([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]);
    h.step(22);
    expect(h.generation).toBe(2 ** 22);
    expect(h.population).toBe(5);
    expect(h.bounds()).toEqual({ x0: 2 ** 20, y0: 2 ** 20, x1: 2 ** 20 + 2, y1: 2 ** 20 + 2 });
  });

  it("collects a board of hundreds of thousands of cells (they were spread into one call, past what a call takes)", () => {
    const cells = soup(11, 600, 600, 0.9);
    expect(cells.length).toBeGreaterThan(300_000);
    const h = new Hashlife();
    h.load(cells);
    const pop = h.population;
    h.collect();
    expect(h.population).toBe(pop);
  }, 60_000);

  it("runs Breeder 1 to generation 4096 to the same population, and keeps it after collecting", () => {
    const cells = parseRLE(readFileSync(path.join(process.cwd(), "test/fixtures/breeder1.rle"), "utf8")).cells.map(([x, y]) => [x, y] as [number, number]);
    const h = new Hashlife();
    h.load(cells);
    h.step(12);
    const w = tiledAfter(cells, 4096);
    expect(h.population).toBe(w.population);
    const b = h.bounds()!;
    const wb = w.bounds()!;
    expect(b).toEqual(wb);
    h.collect();
    expect(h.population).toBe(w.population);
    h.step(0);
    w.step();
    expect(h.population).toBe(w.population);
  }, 60_000);
});
