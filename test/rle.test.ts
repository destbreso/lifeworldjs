import { describe, expect, it } from "vitest";
import { baseRule, formatRLE, liveCells, looksLikeRLE, parseRLE, patternToRle, rleToPattern } from "../src/features/rle";

const GLIDER = [
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 1],
];

function population(p: number[][]): number {
  return p.reduce((s, r) => s + r.reduce((a, b) => a + (b ? 1 : 0), 0), 0);
}

describe("rle codec", () => {
  it("decodes the canonical glider RLE", () => {
    const p = rleToPattern("x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!");
    expect(p).toEqual(GLIDER);
  });

  it("ignores comment and header lines and body line wraps", () => {
    const withNoise = "#N Glider\n#C a comment\nx = 3, y = 3, rule = B3/S23\nbo$2b\no$3o!";
    expect(rleToPattern(withNoise)).toEqual(GLIDER);
  });

  it("round-trips pattern -> RLE -> pattern", () => {
    const rle = patternToRle(GLIDER);
    expect(rleToPattern(rle)).toEqual(GLIDER);
  });

  it("preserves blank interior rows through a round-trip", () => {
    const withGap = [
      [1, 0, 1],
      [0, 0, 0],
      [1, 0, 1],
    ];
    expect(rleToPattern(patternToRle(withGap))).toEqual(withGap);
  });

  it("decodes Sir Robin to the known dimensions and cell count", () => {
    // First elementary knightship (Goucher, 2018): 31 x 79, 282 cells.
    const SIR_ROBIN = `x = 31, y = 79, rule = B3/S23
4b2o$4bo2bo$4bo3bo$6b3o$2b2o6b4o$2bob2o4b4o$bo4bo6b3o$2b4o4b2o3bo$o9b
2o$bo3bo$6b3o2b2o2bo$2b2o7bo4bo$13bob2o$10b2o6bo$11b2ob3obo$10b2o3bo2b
o$10bobo2b2o$10bo2bobobo$10b3o6bo$11bobobo3bo$14b2obobo$11bo6b3o2$11bo
9bo$11bo3bo6bo$12bo5b5o$12b3o$16b2o$13b3o2bo$11bob3obo$10bo3bo2bo$11bo
4b2ob3o$13b4obo4b2o$13bob4o4b2o$19bo$20bo2b2o$20b2o$21b5o$25b2o$19b3o
6bo$20bobo3bobo$19bo3bo3bo$19bo3b2o$18bo6bob3o$19b2o3bo3b2o$20b4o2bo2b
o$22b2o3bo$21bo$21b2obo$20bo$19b5o$19bo4bo$18b3ob3o$18bob5o$18bo$20bo$
16bo4b4o$20b4ob2o$17b3o4bo$24bobo$28bo$24bo2b2o$25b3o$22b2o$21b3o5bo$
24b2o2bobo$21bo2b3obobo$22b2obo2bo$24bobo2b2o$26b2o$22b3o4bo$22b3o4bo$
23b2o3b3o$24b2ob2o$25b2o$25bo2$24b2o$26bo!`;
    const p = rleToPattern(SIR_ROBIN);
    expect(p.length).toBe(79);
    expect(Math.max(...p.map((r) => r.length))).toBe(31);
    expect(population(p)).toBe(282);
  });
});

describe("the whole RLE file", () => {
  const snark = `#N Snark
#O Mike Playle
#C The fastest and smallest 90-degree stable glider reflector (as of
#C June 2013).
x = 17, y = 23, rule = B3/S23
6b2o3b2o$6b2o2bob3o$10bo4bo$6b4ob2o2bo$6bo2bobobob2o$9bobobobo$10b2obo
bo$14bo2$2o$bo7b2o$bobo5b2o$2b2o7$12b2o$3b2o7bo$2bobo8b3o$4bo10bo!`;

  it("reads its name, author, comments, size and rule", () => {
    const p = parseRLE(snark);
    expect(p.name).toBe("Snark");
    expect(p.author).toBe("Mike Playle");
    expect(p.comments).toHaveLength(2);
    expect([p.width, p.height, p.rule]).toEqual([17, 23, "B3/S23"]);
    expect(p.cells).toHaveLength(57);
  });

  it("agrees with rleToPattern on the cells", () => {
    const grid = rleToPattern(snark);
    const fromParse = new Set(parseRLE(snark).cells.map(([x, y]) => `${x},${y}`));
    const fromGrid = new Set(grid.flatMap((row, y) => row.flatMap((v, x) => (v ? [`${x},${y}`] : []))));
    expect(fromParse).toEqual(fromGrid);
  });

  it("round-trips cells, and states as Golly's A to X", () => {
    const cells: [number, number, number][] = [[0, 0, 1], [1, 0, 1], [5, 0, 3], [2, 4, 24], [3, 4, 24], [0, 9, 2]];
    const text = formatRLE(cells, { name: "mix", rule: "B36/S23" });
    expect(text).toMatch(/^#N mix\nx = 6, y = 10, rule = B36\/S23\n/);
    const back = parseRLE(text);
    expect(back.cells.sort()).toEqual(cells.sort());
    // plain cells stay two-state
    expect(formatRLE([[0, 0], [2, 0]])).toBe("x = 3, y = 1, rule = B3/S23\nobo!\n");
  });

describe("parseRLE and whitespace", () => {
  it("ignores spaces inside the body, as LifeWiki's files have them", () => {
    // honeyfarmgenerator.rle and p74honeyfarmhassler2.rle break their lines on a space
    const p = parseRLE("x = 6, y = 2, rule = B3/S23\n2o 3b o$ 6o!");
    expect(p.cells.map(([x, y]) => [x, y])).toEqual([[0, 0], [1, 0], [5, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]);
  });
});
});

describe("looksLikeRLE", () => {
  it("knows a pattern with its header, or its body alone as it is often shared", () => {
    expect(looksLikeRLE("x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!")).toBe(true);
    expect(looksLikeRLE("#N Glider\nbo$2bo$3o!")).toBe(true);
    // a body cut short, with no "!", as a chat message cuts it
    expect(looksLikeRLE("154b2o16b2o$153bo2bo14bo2bo$\n162bobo11bobo$163bo12bobo$177bo6$3b")).toBe(true);
  });

  it("never takes a Glider ISA program, or text with no live cell, for one", () => {
    expect(looksLikeRLE('a = EMIT gosper SE AT 0 0\nSWITCH a "A"\nABSORB a AT 60')).toBe(false);
    expect(looksLikeRLE("CROSS g AT 19 WITH c")).toBe(false);
    expect(looksLikeRLE("3b$2b!")).toBe(false);
    expect(looksLikeRLE("  \n# only a comment")).toBe(false);
  });
});

describe("Golly's rules with marks", () => {
  it("keeps a History or Super rule's odd states alive and drops its even ones", () => {
    // A on, B history, C marked on, D marked off, E start on, F boundary
    const p = parseRLE("x = 6, y = 1, rule = LifeHistory\nABCDEF!");
    expect(liveCells(p)).toEqual([[0, 0], [2, 0], [4, 0]]);
    expect(liveCells(parseRLE("x = 2, y = 1, rule = B36/S23History\nAB!"))).toEqual([[0, 0]]);
    // in a plain rule a state is the file's own, a colour on this site's boards, and every cell is alive
    expect(liveCells(parseRLE("x = 2, y = 1, rule = B3/S23\nAB!"))).toEqual([[0, 0], [1, 0]]);
  });

  it("names the rule without the marks, as B/S", () => {
    expect(["LifeHistory", "LifeSuper", "Life", "B3/S23", "b3/s23", "23/3", "B36/S23History", "B3/S23:T100,100"].map(baseRule)).toEqual(["B3/S23", "B3/S23", "B3/S23", "B3/S23", "B3/S23", "B3/S23", "B36/S23", "B3/S23:T100,100"]);
  });
});

describe("states past 24", () => {
  it("are written with Golly's prefix and read back: 25 is pA", () => {
    const cells: [number, number, number][] = [[0, 0, 24], [1, 0, 25], [2, 0, 25], [0, 1, 1], [3, 1, 14]];
    const rle = formatRLE(cells, { rule: "LifeSuper" });
    expect(rle).toContain("X2pA");
    expect(parseRLE(rle).cells).toEqual(cells);
  });
});
