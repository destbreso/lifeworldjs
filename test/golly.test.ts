// The engine against Golly itself: the same pattern run as many generations by Golly's command-line bgolly and here,
// every cell's state compared. Runs only where bgolly is installed (GOLLY_BGOLLY, or Golly 5.0's macOS folder); its
// patterns are made here, from seeds, so none of Golly's own (GPL) are copied into this repository.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatRLE, parseRLE } from "../src/rle";
import { splitmix32 } from "./rng";
import { splitFamily } from "../src/super";
import { mapOf, parseRule, type ParsedRule } from "../src/rules";
import { LifeWorld, TILE } from "../src/tiled";

const BGOLLY = process.env.GOLLY_BGOLLY ?? "/Applications/golly-5.0-mac/bgolly";
const here = existsSync(BGOLLY);

/** the cells with a state, moved so their box starts at 0,0 (where each program puts a pattern is its own) */
const norm = (cells: [number, number, number][]) => {
  if (!cells.length) return "";
  const x0 = Math.min(...cells.map((c) => c[0])),
    y0 = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y, s]) => `${x - x0},${y - y0}:${s}`).sort().join(" ");
};

function ours(rule: string, cells: [number, number, number][], gens: number) {
  const { base, family } = splitFamily(rule);
  const w = new LifeWorld(parseRule(base) as ParsedRule);
  if (family) w.setFamily(family);
  for (const [x, y, s] of cells) w.setState(x, y, s);
  for (let g = 0; g < gens; g++) w.step();
  const out: [number, number, number][] = [];
  for (const t of w.tiles.values())
    for (let i = 0; i < TILE * TILE; i++) {
      const s = t.state ? t.state[i] : (t.bits[(i / TILE) | 0] >>> i % TILE) & 1;
      if (s) out.push([t.tx * TILE + (i % TILE), t.ty * TILE + ((i / TILE) | 0), s]);
    }
  return out;
}

function golly(rule: string, cells: [number, number, number][], gens: number) {
  const dir = mkdtempSync(join(tmpdir(), "golly-"));
  try {
    writeFileSync(join(dir, "in.rle"), formatRLE(cells, { rule }));
    execFileSync(BGOLLY, ["-q", "-q", "-a", splitFamily(rule).family ? "Super" : "QuickLife", "-m", String(gens), "-o", join(dir, "out.rle"), join(dir, "in.rle")], { stdio: "pipe", timeout: 60_000 });
    return parseRLE(readFileSync(join(dir, "out.rle"), "utf8")).cells as [number, number, number][];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** a soup of live cells, and with a family dead marked ones too, boundaries among them */
function soup(seed: number, states: number, size = 36): [number, number, number][] {
  const rand = splitmix32(seed);
  const out: [number, number, number][] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = rand();
      if (r < 0.35) out.push([x, y, 1 + 2 * Math.floor(rand() * Math.floor(states / 2))]);
      else if (states > 2 && r < 0.45) out.push([x, y, 2 * (1 + Math.floor(rand() * Math.floor((states - 1) / 2)))]);
    }
  return out;
}

describe.skipIf(!here)("the engine against Golly's bgolly", () => {
  const cases: [string, number, number][] = [
    ["LifeHistory", 7, 1],
    ["LifeSuper", 26, 2],
    ["B36/S23History", 7, 3],
    ["B36/S23Super", 26, 4],
    ["B2e3air4k5ckn6n/S1c23-knqy4ery5ekn6a7c", 2, 5],
    ["B3-i/S23", 2, 6],
    ["B36-c/S23-a", 2, 7],
  ];
  for (const [rule, states, seed] of cases)
    it(`${rule}: every cell's state after 200 generations, as Golly gives it`, () => {
      const cells = soup(seed, states);
      expect(norm(ours(rule, cells, 200))).toBe(norm(golly(rule, cells, 200)));
    }, 60_000);

  it("a MAP rule that is not isotropic, read the way Golly reads it", () => {
    // (born on 3 unless the east neighbour lives, kept on 2 or 3 unless the north-west one does)
    const table = Uint8Array.from({ length: 512 }, (_, x) => {
      let n = 0;
      for (let m = x & 0x1ef; m; m &= m - 1) n++;
      return (x & 0x10 ? (n === 2 || n === 3) && !(x & 0x100) : n === 3 && !(x & 0x8)) ? 1 : 0;
    });
    const rule = mapOf(table);
    const cells = soup(8, 2);
    expect(norm(ours(rule, cells, 150))).toBe(norm(golly(rule, cells, 150)));
  }, 60_000);
});
