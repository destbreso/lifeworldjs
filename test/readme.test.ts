import { describe, expect, it } from "vitest";
import {
  CONWAY,
  Hashlife,
  LifeWorld,
  META_PERIOD,
  analyze,
  liveCells,
  metafyInto,
  metaStates,
  paintLife,
  parseRLE,
  parseRule,
  separate,
} from "../src/index";

// The README's examples, run: what each prints is what the README says it prints.
describe("the README's examples", () => {
  it("a first world", () => {
    const w = new LifeWorld(CONWAY);
    for (const [x, y] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) w.set(x, y, 0x22d3ee);
    for (let g = 0; g < 4; g++) w.step();
    expect([w.generation, w.population, w.bounds()]).toEqual([4, 5, { x0: 1, y0: 1, x1: 3, y1: 3 }]);
  });

  it("colours: a birth takes its parents' average", () => {
    const w = new LifeWorld(CONWAY);
    w.set(0, 0, 0xff0000);
    w.set(1, 0, 0xffffff);
    w.set(2, 0, 0x0000ff);
    w.step();
    expect([w.get(1, -1), w.get(1, 0), w.get(1, 1)].map((c) => c.toString(16))).toEqual(["aa55aa", "ffffff", "aa55aa"]);
    expect(w.get(0, 0)).toBe(-1);
  });

  it("age and heat", () => {
    const w = new LifeWorld();
    for (const [x, y] of [[0, 0], [1, 0], [2, 0]]) w.set(x, y, 0x22d3ee);
    for (let g = 0; g < 10; g++) w.step();
    const t = w.getTile(0, 0)!;
    const i = 0 * 32 + 1; // the cell (1, 0): row 0, column 1 of tile (0, 0)
    expect([w.generation, w.age(t, i), w.heatOf(t, i)]).toEqual([10, 11, 11]);
    const j = 0 * 32 + 0; // (0, 0), alive every other generation
    expect([w.get(0, 0), w.heatOf(t, j)]).toEqual([0x22d3ee, 6]);
  });

  it("an RLE file", () => {
    const gun = parseRLE(`#N Gosper glider gun
x = 36, y = 9, rule = B3/S23
24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!`);
    const w = new LifeWorld();
    for (const [x, y] of liveCells(gun)) w.set(x, y, 0xfacc15);
    for (let g = 0; g < 300; g++) w.step();
    expect([gun.name, gun.width, gun.height, w.population, w.last]).toEqual(["Gosper glider gun", 36, 9, 86, { births: 36, deaths: 43 }]);
  });

  it("a leap with HashLife", () => {
    const h = new Hashlife(CONWAY);
    h.load([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]);
    let left = 1_000_000;
    while (left > 0) {
      const j = Math.floor(Math.log2(left));
      h.step(j);
      left -= 2 ** j;
    }
    expect([h.generation, h.population, h.bounds()]).toEqual([1_000_000, 5, { x0: 250000, y0: 250000, x1: 250002, y1: 250002 }]);
  });

  it("a rule by shape", () => {
    const rule = parseRule("B2e3air4k5ckn6n/S1c23-knqy4ery5ekn6a7c");
    if ("error" in rule) throw new Error(rule.error);
    const w = new LifeWorld(rule);
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [2, 2]]) w.set(x, y, 0xffffff);
    for (let g = 0; g < 50; g++) w.step();
    expect([rule.birth, rule.survival, rule.table?.length, w.rule.name]).toEqual([[2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7], 512, "B2e3air4k5ckn6n/S1c23-knqy4ery5ekn6a7c"]);
    expect(parseRule("B0/S8")).toEqual({ error: "a birth from no neighbours (B0) is not run here" });
  });

  it("Golly's History", () => {
    const w = new LifeWorld();
    w.setFamily("History");
    for (const [x, y] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) w.set(x, y, 0xffffff);
    for (let g = 0; g < 8; g++) w.step();
    expect([w.population, w.markedCount(), w.getState(3, 4), w.getState(0, 2)]).toEqual([5, 10, 1, 2]);
  });

  it("what a pattern does", () => {
    expect(analyze([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]])).toEqual({ kind: "ship", period: 4, dx: 1, dy: 1, from: 0 });
    expect(analyze([[0, 0], [1, 0], [2, 0]])).toEqual({ kind: "oscillator", period: 2, from: 0 });
    expect(separate([[0, 0], [1, 0], [0, 1], [10, 10], [11, 10]]).map((o) => o.cells.length)).toEqual([3, 2]);
  });

  it("a glider of metapixels", () => {
    const h = new Hashlife(CONWAY);
    const glider = [
      [0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    metafyInto(h, glider);
    let left = 5 * META_PERIOD;
    while (left > 0) {
      const j = Math.floor(Math.log2(left));
      h.step(j);
      left -= 2 ** j;
    }
    expect(metaStates((box) => h.count(box), 5, 5)).toEqual([
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ]);
    expect(h.generation).toBe(176_640);
  });

  it("a picture", () => {
    const w = new LifeWorld();
    for (const [x, y] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) w.set(x, y, 0x22d3ee);
    const p = paintLife(w, { x: -2, y: -2, scale: 8 }, 64, 64, { mode: "color", background: 0x0b0e14 });
    expect([p.w, p.h, p.px, p.data.length]).toEqual([10, 10, 8, 400]);
  });
});
