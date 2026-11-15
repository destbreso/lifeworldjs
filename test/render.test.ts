import { describe, expect, it } from "vitest";
import { LifeWorld } from "../src/core/tiled";
import { paintLife } from "../src/features/render";
import { STATE_COLORS } from "../src/core/super";

const BG = 0x050a05;
const rgb = (p: { data: Uint8ClampedArray; w: number }, x: number, y: number) => {
  const o = (y * p.w + x) * 4;
  return (p.data[o] << 16) | (p.data[o + 1] << 8) | p.data[o + 2];
};

describe("paintLife", () => {
  const w = new LifeWorld();
  for (const [x, y] of [[10, 10], [11, 10], [10, 11], [11, 11]]) w.set(x, y, 0xff0000);
  w.set(-500, 300, 0x00ff00);

  it("close up: a pixel a cell, placed where the view puts it", () => {
    const p = paintLife(w, { x: 8.5, y: 9, scale: 10 }, 100, 60, { mode: "color", background: BG });
    expect(p.px).toBe(10);
    // cell 10 is the third pixel from cell 8, which starts half a cell left of the screen
    expect(p.left).toBe(-5);
    expect(rgb(p, 2, 1)).toBe(0xff0000);
    expect(rgb(p, 3, 2)).toBe(0xff0000);
    expect(rgb(p, 1, 1)).toBe(BG);
  });

  it("zoomed out: cells add up into the pixel they fall in, and a lone cell still shows", () => {
    const p = paintLife(w, { x: -512, y: 0, scale: 1 / 4 }, 200, 200, { mode: "color", background: BG });
    expect(p.px).toBe(1);
    // the block: 4 cells in the pixel of (10..11, 10..11), full red at a quarter of its 16 cells
    const block = rgb(p, Math.floor((10 + 512) / 4), Math.floor(10 / 4));
    expect(block >>> 16).toBeGreaterThan(0xa0);
    const lone = rgb(p, Math.floor((-500 + 512) / 4), Math.floor(300 / 4));
    expect((lone >>> 8) & 255).toBeGreaterThan(0x60);
  });

  it("a tile smaller than a pixel counts at once", () => {
    const p = paintLife(w, { x: -2048, y: -2048, scale: 1 / 64 }, 64, 64, { mode: "color", background: BG });
    const lit = [...Array(64 * 64).keys()].filter((i) => rgb(p, i % 64, Math.floor(i / 64)) !== BG);
    expect(lit.length).toBe(2);
  });

  it("heat shows where cells have lived, dead or alive", () => {
    const v = new LifeWorld();
    for (const x of [0, 1, 2]) v.set(x, 0, 0xffffff);
    for (let g = 0; g < 7; g++) v.step();
    const p = paintLife(v, { x: -2, y: -2, scale: 4 }, 40, 40, { mode: "heat", background: BG });
    // the blinker's middle cell, alive all along, is the hottest; the cells it turns through are warm
    expect(rgb(p, 3, 2) >>> 16).toBe(255);
    expect(rgb(p, 3, 1)).not.toBe(BG);
  });
});

describe("a family's world", () => {
  it("is drawn in Golly's colours, its dead marks too, and a tile of marks alone with them", () => {
    const w = new LifeWorld();
    w.setFamily("History");
    w.setState(0, 0, 3);
    w.setState(2, 0, 4);
    w.setState(100, 100, 6);
    const p = paintLife(w, { x: 0, y: 0, scale: 4 }, 16, 16, { mode: "color", background: 0x000000 });
    const at = (x: number, y: number) => {
      const o = (y * p.w + x) * 4;
      return (p.data[o] << 16) | (p.data[o + 1] << 8) | p.data[o + 2];
    };
    expect(at(0, 0)).toBe(STATE_COLORS.History[3]);
    expect(at(2, 0)).toBe(STATE_COLORS.History[4]);
    expect(at(1, 0)).toBe(0);
    const far = paintLife(w, { x: 98, y: 98, scale: 4 }, 16, 16, { mode: "color", background: 0x000000 });
    const o = (2 * far.w + 2) * 4;
    expect((far.data[o] << 16) | (far.data[o + 1] << 8) | far.data[o + 2]).toBe(STATE_COLORS.History[6]);
  });
});
