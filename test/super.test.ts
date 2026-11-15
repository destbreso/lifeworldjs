import { describe, expect, it } from "vitest";
import { familyRule, FAMILY_STATES, nextState, splitFamily, type Family } from "../src/core/super";
import { LifeWorld, type Rule } from "../src/core/tiled";
import { splitmix32 } from "./rng";

const m = (...s: number[]) => s.reduce((a, x) => a | (1 << x), 0);

describe("a cell's next state, as Golly's help describes each state", () => {
  it("History: a dying cell leaves history, marks keep their mark, a start cell becomes a marked one", () => {
    expect(nextState("History", 1, m(0), false)).toBe(2);
    expect(nextState("History", 2, m(0, 1), true)).toBe(1);
    expect(nextState("History", 0, m(0, 1), true)).toBe(1);
    expect(nextState("History", 3, m(0), false)).toBe(4);
    expect(nextState("History", 4, m(0, 1), true)).toBe(3);
    expect(nextState("History", 5, m(0), false)).toBe(4);
    // a survivor and a cell that stays dead keep their states
    expect(nextState("History", 5, m(0, 1), true)).toBe(5);
    expect(nextState("History", 4, m(0), false)).toBe(4);
  });

  it("History: a boundary is never born and turns off the live cells it touches", () => {
    expect(nextState("History", 6, m(0, 1), true)).toBe(6);
    expect(nextState("History", 1, m(0, 1, 6), true)).toBe(2);
    expect(nextState("History", 3, m(0, 1, 6), true)).toBe(4);
    expect(nextState("History", 5, m(0, 1, 6), true)).toBe(4);
    // a dead cell beside it is still born as the rule says
    expect(nextState("History", 0, m(0, 1, 6), true)).toBe(1);
  });

  it("Super: the trails, the no-trail boundary, and no-trail cells that leave nothing", () => {
    expect(nextState("Super", 9, m(0), false)).toBe(10);
    expect(nextState("Super", 11, m(0), false)).toBe(12);
    expect(nextState("Super", 7, m(0), false)).toBe(8);
    expect(nextState("Super", 8, m(0, 1), true)).toBe(7);
    for (const c of [13, 15, 17, 19, 21, 23, 25]) expect(nextState("Super", c, m(0), false)).toBe(0);
  });

  it("Super: a birth takes its live neighbours' state when they agree, else 1, or 13 among no-trail cells", () => {
    expect(nextState("Super", 0, m(0, 9), true)).toBe(9);
    expect(nextState("Super", 0, m(0, 15), true)).toBe(15);
    expect(nextState("Super", 0, m(0, 9, 11), true)).toBe(1);
    expect(nextState("Super", 0, m(0, 15, 17), true)).toBe(13);
    expect(nextState("Super", 0, m(0, 1, 15), true)).toBe(1);
    // a marked cell among no-trail ones of one state, and a no-trail boundary cell among trail ones of one state
    expect(nextState("Super", 0, m(0, 3, 15), true)).toBe(15);
    expect(nextState("Super", 0, m(0, 7, 9), true)).toBe(9);
  });

  it("Super: labels vanish, are removed when touched, cycle, or wake", () => {
    expect(nextState("Super", 14, m(0), false)).toBe(0);
    expect(nextState("Super", 16, m(0), false)).toBe(16);
    expect(nextState("Super", 16, m(0, 1), false)).toBe(14);
    expect(nextState("Super", 16, m(0, 14), false)).toBe(14);
    expect(nextState("Super", 18, m(0, 22), false)).toBe(22);
    expect(nextState("Super", 20, m(0, 18), false)).toBe(18);
    expect(nextState("Super", 22, m(0, 20), false)).toBe(20);
    expect(nextState("Super", 24, m(0, 13), false)).toBe(18);
    expect(nextState("Super", 24, m(0), false)).toBe(24);
  });

  it("Super: beside a boundary the no-trail cells and labels go to 0, the rest as in History", () => {
    for (const c of [7, 8, 13, 14, 16, 24, 25]) expect(nextState("Super", c, m(0, 6), true)).toBe(0);
    expect(nextState("Super", 9, m(0, 6), true)).toBe(10);
    expect(nextState("Super", 1, m(0, 6), true)).toBe(2);
  });

  it("names a rule as Golly does", () => {
    expect(splitFamily("LifeHistory")).toEqual({ base: "B3/S23", family: "History" });
    expect(splitFamily("B36/S23Super")).toEqual({ base: "B36/S23", family: "Super" });
    expect(splitFamily("B3/S23")).toEqual({ base: "B3/S23", family: null });
    expect(familyRule("B3/S23", "Super")).toBe("LifeSuper");
    expect(familyRule("B36/S23", "History")).toBe("B36/S23History");
  });
});

// ── The engine against a plain reading of Golly's step: every cell, every generation, from the states as they were ──

// wide enough that nothing of a 32 by 32 soup in its middle reaches its edge in 120 generations: a glider goes 30 cells
const N = 160;
function denseStep(g: Uint8Array, family: Family, rule: Rule): Uint8Array {
  const B = new Set(rule.birth),
    S = new Set(rule.survival);
  const out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let on = 0,
        mask = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx,
            ny = y + dy;
          const s = nx < 0 || ny < 0 || nx >= N || ny >= N ? 0 : g[ny * N + nx];
          mask |= 1 << s;
          on += s & 1;
        }
      const c = g[y * N + x];
      out[y * N + x] = nextState(family, c, mask, c & 1 ? S.has(on) : B.has(on));
    }
  return out;
}

/** a soup in the middle of the grid: live cells in the family's odd states, and dead marked ones, boundaries among them */
function soup(seed: number, family: Family, withBoundary: boolean): Uint8Array {
  const rand = splitmix32(seed);
  const g = new Uint8Array(N * N);
  const states = FAMILY_STATES[family];
  for (let y = 64; y < 96; y++)
    for (let x = 64; x < 96; x++) {
      const r = rand();
      if (r < 0.35) g[y * N + x] = 1 + 2 * Math.floor(rand() * Math.floor(states / 2));
      else if (r < 0.5) {
        const s = 2 * (1 + Math.floor(rand() * Math.floor((states - 1) / 2)));
        g[y * N + x] = s === 6 && !withBoundary ? 2 : s;
      }
    }
  return g;
}

const worldOf = (g: Uint8Array, family: Family, rule: Rule) => {
  const w = new LifeWorld(rule);
  w.setFamily(family);
  for (let i = 0; i < N * N; i++) if (g[i]) w.setState(i % N, (i / N) | 0, g[i]);
  return w;
};
const statesOf = (w: LifeWorld) => {
  const out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + x] = w.getState(x, y);
  return out;
};

describe("the engine steps a family's states as Golly does", () => {
  const rules: [string, Rule][] = [
    ["B3/S23", { birth: [3], survival: [2, 3] }],
    ["B36/S23", { birth: [3, 6], survival: [2, 3] }],
  ];
  for (const family of ["History", "Super"] as const)
    for (const [name, rule] of rules)
      it(`${family} over ${name}: every cell's state, generation by generation, as a plain reading of Golly's step gives it`, () => {
        for (const seed of [1, 2, 3]) {
          let g = soup(seed, family, true);
          const w = worldOf(g, family, rule);
          for (let gen = 1; gen <= 120; gen++) {
            const before = g;
            g = denseStep(g, family, rule);
            w.step();
            // the counters: births and deaths are changes of life, a boundary's kills among them; marked cells are dead ones
            let births = 0,
              deaths = 0,
              marked = 0;
            for (let i = 0; i < g.length; i++) {
              if (g[i] & 1 && !(before[i] & 1)) births++;
              if (!(g[i] & 1) && before[i] & 1) deaths++;
              if (g[i] && !(g[i] & 1)) marked++;
            }
            expect(w.last, `${family} ${name} seed ${seed} generation ${gen}`).toEqual({ births, deaths });
            expect(w.markedCount()).toBe(marked);
            const got = statesOf(w);
            const diff = got.findIndex((s, i) => s !== g[i]);
            expect(diff, `${family} ${name} seed ${seed} generation ${gen} at ${diff % N},${(diff / N) | 0}`).toBe(-1);
            let live = 0;
            for (const s of g) live += s & 1;
            // every live cell is inside the grid the reference reads, so the two are the whole world
            expect(w.population).toBe(live);
          }
        }
      }, 60_000);

  it("without a boundary, a family changes no cell's life: the live cells are those of the plain rule", () => {
    for (const family of ["History", "Super"] as const) {
      const g = soup(7, family, false);
      const w = worldOf(g, family, { birth: [3], survival: [2, 3] });
      const plain = new LifeWorld();
      for (let i = 0; i < N * N; i++) if (g[i] & 1) plain.set(i % N, (i / N) | 0, 1);
      for (let gen = 0; gen < 200; gen++) {
        w.step();
        plain.step();
      }
      const live = (x: LifeWorld) => [...x.cells()].map(([a, b]) => `${a},${b}`).sort().join(" ");
      expect(live(w)).toBe(live(plain));
    }
  });

  it("keeps a tile of dead marks however long nothing lives in it, and lets an empty one go", () => {
    const w = new LifeWorld();
    w.setFamily("History");
    w.setState(500, 500, 4);
    // a lone cell dies at once and leaves its history; a cell drawn and erased leaves nothing
    w.set(0, 0, 1);
    w.set(1000, 1000, 1);
    w.set(1000, 1000, -1);
    for (let g = 0; g < 600; g++) w.step();
    expect(w.getState(500, 500)).toBe(4);
    expect(w.getState(0, 0)).toBe(2);
    expect(w.getState(1000, 1000)).toBe(0);
    expect(w.tiles.size).toBe(2);
  });

  it("switches family as Golly's scripts do: up keeps every state, down to History maps Super's, none keeps the live cells", () => {
    const w = new LifeWorld();
    w.set(1, 1, 1);
    w.setFamily("Super");
    expect(w.getState(1, 1)).toBe(1);
    for (const [x, s] of [[2, 9], [3, 10], [4, 13], [5, 14], [6, 7], [7, 8], [8, 5]] as const) w.setState(x, 1, s);
    w.setFamily("History");
    expect([2, 3, 4, 5, 6, 7, 8].map((x) => w.getState(x, 1))).toEqual([1, 2, 1, 0, 3, 4, 5]);
    w.setFamily(null);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((x) => w.getState(x, 1))).toEqual([1, 1, 0, 1, 0, 1, 0, 1]);
  });
});
