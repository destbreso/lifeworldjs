import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRLE } from "../src/rle";
import { Hashlife } from "../src/hashlife";
import { META_PERIOD, metafy, metafyInto, metapixels, metaStates } from "../src/metapixel";

/** HashLife to a generation, a leap for each binary digit of the distance */
const leapTo = (h: Hashlife, g: number) => {
  for (let left = g - h.generation; left > 0; ) {
    const j = Math.floor(Math.log2(left));
    h.step(j);
    left -= 2 ** j;
  }
};
const pairs = (xy: number[]) => Array.from({ length: xy.length / 2 }, (_, i) => [xy[2 * i], xy[2 * i + 1]] as [number, number]);

describe("the OTCA metapixel, as Golly's metafier builds it", () => {
  it("is LifeWiki's metapixel: its ON cell with no rule programmed, 404 generations on, but for the phase adjuster metafier.py changed", () => {
    // LifeWiki's file is a metapixel switched on, its rule table's eaters all broken, at that generation; the third
    // phase adjuster, placed at (269, 2037) turned, was "a different shape in the original metacell", the script says
    const h = new Hashlife();
    h.load(pairs(metapixels({ birth: [], survival: [] }).on));
    leapTo(h, 404);
    const key = ([x, y]: [number, number]) => `${x},${y}`;
    const adjuster = ([x, y]: [number, number]) => x >= 192 && x <= 287 && y >= 1984 && y <= 2047;
    // the file's corner is the cell's own corner tub, at (-5, -5)
    const wiki = parseRLE(readFileSync("test/fixtures/otcametapixel.rle", "utf8")).cells.map(([x, y]) => [x - 5, y - 5] as [number, number]);
    const ours = h.cells();
    expect(new Set(ours.filter((c) => !adjuster(c)).map(key))).toEqual(new Set(wiki.filter((c) => !adjuster(c)).map(key)));
    expect(ours.filter((c) => !adjuster(c)).length).toBeGreaterThan(64_000);
    expect(new Set(ours.filter(adjuster).map(key))).not.toEqual(new Set(wiki.filter(adjuster).map(key)));
  }, 60_000);

  it("builds the same board straight into HashLife's quadtree as from the list of its cells", () => {
    for (const rows of [
      [[0, 1, 0], [0, 1, 0], [0, 1, 0]],
      [[1, 0, 1, 1], [0, 1, 1, 0]],
    ]) {
      const a = new Hashlife();
      a.load(metafy(rows));
      const b = new Hashlife();
      metafyInto(b, rows);
      const key = (h: Hashlife) => new Set(h.cells().map(([x, y]) => `${x},${y}`));
      expect(b.population).toBe(a.population);
      expect(key(b)).toEqual(key(a));
      // HashLife's bounds go by node id: they were wrong while nodes made before a clear shared ids with later ones
      expect(b.bounds()).toEqual(a.bounds());
    }
  });

  it("runs a blinker at the meta level: a meta generation every 35,328 generations, the first cycle sending the first signals", () => {
    const vertical = [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ];
    const horizontal = [
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ];
    const h = new Hashlife();
    h.load(metafy(vertical));
    const read = () => metaStates((box) => h.cells(box).length, 3, 3);
    expect(read()).toEqual(vertical);
    leapTo(h, META_PERIOD);
    expect(read()).toEqual(vertical);
    leapTo(h, 2 * META_PERIOD);
    expect(read()).toEqual(horizontal);
    leapTo(h, 3 * META_PERIOD);
    expect(read()).toEqual(vertical);
    leapTo(h, 4 * META_PERIOD);
    expect(read()).toEqual(horizontal);
  }, 60_000);
});
