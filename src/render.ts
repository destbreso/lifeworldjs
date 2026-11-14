// A LifeWorld or a Hashlife as a picture, at any zoom. Close up, each visible cell is a pixel of a small image the
// canvas scales up without smoothing, with a dark line between cells; zoomed out, each screen pixel adds up the cells
// in it (a whole tile at once when a tile is smaller than a pixel) and shows their mean colour, brighter the denser,
// so a lone glider far out is still a dot. paintLife and paintHash build the pixels with no DOM; drawLife and drawHash
// put them on a canvas.

import { TILE, type LifeWorld, type Tile } from "./tiled";
import type { Hashlife } from "./hashlife";
import { STATE_COLORS } from "./super";

export type ColorMode = "color" | "age" | "heat";

/** what the screen shows: the world point at its top-left corner, and pixels a cell (below 1 when zoomed out) */
export interface LifeView {
  x: number;
  y: number;
  scale: number;
}

export interface PaintOpts {
  mode: ColorMode;
  /** 0xRRGGBB behind the cells */
  background: number;
  /** a cell's colour as it is drawn (a board's look over the cells' own colours, which stay as they are) */
  ink?: (rgb: number) => number;
}

export interface Painted {
  /** RGBA, w by h */
  data: Uint8ClampedArray;
  w: number;
  h: number;
  /** where its pixel (0, 0) goes on the screen, and how many screen pixels each of its pixels covers */
  left: number;
  top: number;
  px: number;
}

const AGE_FROM = [34, 211, 238],
  AGE_TO = [100, 50, 200];

/** a live cell's colour in a mode; heat is drawn apart (a dead cell can be warm) */
function cellRGB(mode: ColorMode, t: Tile, i: number, w: LifeWorld, ink?: (rgb: number) => number): number {
  let c = t.color[i];
  if (mode === "age") {
    const a = Math.min(w.age(t, i) / 60, 1);
    c = (Math.round(AGE_FROM[0] * (1 - a) + AGE_TO[0] * a) << 16) | (Math.round(AGE_FROM[1] * (1 - a) + AGE_TO[1] * a) << 8) | Math.round(AGE_FROM[2] * (1 - a) + AGE_TO[2] * a);
  }
  return ink ? ink(c) : c;
}

/**
 * A cell of a family's world (Golly's History or Super) in its state's colour, as Golly draws it: live and dead marked
 * cells alike; the hidden label, near black in Golly, a shade off the background so it hides on either board. In age
 * mode a live cell keeps its age's colour.
 */
function stateRGB(w: LifeWorld, mode: ColorMode, t: Tile, i: number, s: number, bg: number, ink?: (rgb: number) => number): number {
  if (s & 1 && mode === "age") return cellRGB(mode, t, i, w, ink);
  if (s === 24) return mix(bg, 0x808080, 0.08);
  const c = STATE_COLORS[w.family!][s];
  return ink ? ink(c) : c;
}

function mix(a: number, b: number, k: number) {
  const ch = (sh: number) => Math.round(((a >>> sh) & 255) * (1 - k) + ((b >>> sh) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** heat t in [0, 1] as the heat map's colour over the background (orange to red, the hottest opaque) */
function heatRGB(t: number, bg: number): number {
  const a = 0.3 + 0.7 * t;
  const r = 255,
    g = Math.round(t * 165),
    b = 0;
  const br = bg >>> 16,
    bgG = (bg >>> 8) & 255,
    bb = bg & 255;
  return (Math.round(r * a + br * (1 - a)) << 16) | (Math.round(g * a + bgG * (1 - a)) << 8) | Math.round(b * a + bb * (1 - a));
}

function tilesIn(w: LifeWorld, x0: number, y0: number, x1: number, y1: number, heat: boolean): Tile[] {
  const out: Tile[] = [];
  const tx0 = Math.floor(x0 / TILE),
    ty0 = Math.floor(y0 / TILE),
    tx1 = Math.floor(x1 / TILE),
    ty1 = Math.floor(y1 / TILE);
  // few tiles in view: look each up; many: walk the world's tiles instead
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= w.tiles.size * 2) {
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = w.getTile(tx, ty);
        if (t && (t.pop || heat || t.state)) out.push(t);
      }
  } else for (const t of w.tiles.values()) if ((t.pop || heat || t.state) && t.tx >= tx0 && t.tx <= tx1 && t.ty >= ty0 && t.ty <= ty1) out.push(t);
  return out;
}

/** The world as pixels for a screen of W by H. */
export function paintLife(w: LifeWorld, view: LifeView, W: number, H: number, opts: PaintOpts): Painted {
  const bg = opts.background;
  const heat = opts.mode === "heat";
  if (view.scale >= 1) {
    // one pixel a cell, over the cells in view
    const cx0 = Math.floor(view.x),
      cy0 = Math.floor(view.y);
    const cw = Math.ceil(W / view.scale) + 2,
      ch = Math.ceil(H / view.scale) + 2;
    const data = new Uint8ClampedArray(cw * ch * 4);
    fill(data, bg);
    const tiles = tilesIn(w, cx0, cy0, cx0 + cw - 1, cy0 + ch - 1, heat);
    let maxHeat = 1;
    if (heat) for (const t of tiles) for (let i = 0; i < TILE * TILE; i++) maxHeat = Math.max(maxHeat, w.heatOf(t, i));
    for (const t of tiles) {
      const bx = t.tx * TILE - cx0,
        by = t.ty * TILE - cy0;
      for (let y = 0; y < TILE; y++) {
        const py = by + y;
        if (py < 0 || py >= ch) continue;
        if (heat) {
          for (let x = 0; x < TILE; x++) {
            const px = bx + x;
            if (px < 0 || px >= cw) continue;
            const h = w.heatOf(t, y * TILE + x);
            if (h) put(data, (py * cw + px) * 4, heatRGB(h / maxHeat, bg));
          }
          continue;
        }
        if (t.state) {
          // a family's world: every cell with a state, dead marks included
          for (let x = 0; x < TILE; x++) {
            const i = y * TILE + x,
              st = t.state[i];
            const px = bx + x;
            if (!st || px < 0 || px >= cw) continue;
            put(data, (py * cw + px) * 4, stateRGB(w, opts.mode, t, i, st, bg, opts.ink));
          }
          continue;
        }
        let row = t.bits[y];
        while (row) {
          const x = 31 - Math.clz32(row & -row);
          row &= row - 1;
          const px = bx + x;
          if (px < 0 || px >= cw) continue;
          put(data, (py * cw + px) * 4, cellRGB(opts.mode, t, y * TILE + x, w, opts.ink));
        }
      }
    }
    return { data, w: cw, h: ch, left: (cx0 - view.x) * view.scale, top: (cy0 - view.y) * view.scale, px: view.scale };
  }

  // zoomed out: each screen pixel adds up the cells in it
  const n = W * H;
  const count = new Float32Array(n),
    r = new Float32Array(n),
    g = new Float32Array(n),
    b = new Float32Array(n);
  const s = view.scale;
  const x1 = view.x + W / s,
    y1 = view.y + H / s;
  const tiles = tilesIn(w, view.x, view.y, x1, y1, false);
  const add = (px: number, py: number, k: number, c: number) => {
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    const i = py * W + px;
    count[i] += k;
    r[i] += (c >>> 16) * k;
    g[i] += ((c >>> 8) & 255) * k;
    b[i] += (c & 255) * k;
  };
  let maxHeat = 1;
  if (heat) for (const t of tiles) for (let i = 0; i < TILE * TILE; i++) if ((t.bits[i >> 5] >>> (i & 31)) & 1) maxHeat = Math.max(maxHeat, w.heatOf(t, i));
  const tileSmall = TILE * s < 1.5;
  for (const t of tiles) {
    if (t.state && !heat) {
      // a family's world: every cell with a state counts, in its state's colour
      let n = 0,
        c = 0;
      for (let i = 0; i < TILE * TILE; i++) {
        const st = t.state[i];
        if (!st) continue;
        const col = stateRGB(w, opts.mode, t, i, st, bg, opts.ink);
        if (tileSmall) {
          n++;
          c = c || col;
          continue;
        }
        add(Math.floor((t.tx * TILE + (i % TILE) - view.x) * s), Math.floor((t.ty * TILE + ((i / TILE) | 0) - view.y) * s), 1, col);
      }
      if (tileSmall && n) add(Math.floor((t.tx * TILE + TILE / 2 - view.x) * s), Math.floor((t.ty * TILE + TILE / 2 - view.y) * s), n, c);
      continue;
    }
    if (tileSmall && !heat && opts.mode === "color") {
      // a tile smaller than a pixel: its population, in the colour of one of its cells
      let c = 0;
      for (let y = 0; y < TILE && !c; y++) if (t.bits[y]) c = t.color[y * TILE + (31 - Math.clz32(t.bits[y] & -t.bits[y]))];
      add(Math.floor((t.tx * TILE + TILE / 2 - view.x) * s), Math.floor((t.ty * TILE + TILE / 2 - view.y) * s), t.pop, opts.ink ? opts.ink(c) : c);
      continue;
    }
    for (let y = 0; y < TILE; y++) {
      let row = t.bits[y];
      if (!row) continue;
      const py = Math.floor((t.ty * TILE + y - view.y) * s);
      while (row) {
        const x = 31 - Math.clz32(row & -row);
        row &= row - 1;
        const i = y * TILE + x;
        const c = heat ? heatRGB(w.heatOf(t, i) / maxHeat, 0) : cellRGB(opts.mode, t, i, w, opts.ink);
        add(Math.floor((t.tx * TILE + x - view.x) * s), py, 1, c);
      }
    }
  }
  const data = new Uint8ClampedArray(n * 4);
  fill(data, bg);
  const perPixel = 1 / (s * s);
  const br = bg >>> 16,
    bgG = (bg >>> 8) & 255,
    bb = bg & 255;
  for (let i = 0; i < n; i++) {
    const k = count[i];
    if (!k) continue;
    // a lone cell still shows; a pixel full of cells shows at its full colour
    const a = 0.45 + 0.55 * Math.sqrt(Math.min(1, k / perPixel));
    const o = i * 4;
    data[o] = (r[i] / k) * a + br * (1 - a);
    data[o + 1] = (g[i] / k) * a + bgG * (1 - a);
    data[o + 2] = (b[i] / k) * a + bb * (1 - a);
  }
  return { data, w: W, h: H, left: 0, top: 0, px: 1 };
}

function fill(data: Uint8ClampedArray, c: number) {
  const r = c >>> 16,
    g = (c >>> 8) & 255,
    b = c & 255;
  for (let o = 0; o < data.length; o += 4) {
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
}

function put(data: Uint8ClampedArray, o: number, c: number) {
  data[o] = c >>> 16;
  data[o + 1] = (c >>> 8) & 255;
  data[o + 2] = c & 255;
}

/**
 * A Hashlife plane as pixels, in one colour (it has none of its own). Close up, the cells in view; zoomed out, the
 * tree is walked down only to nodes the size of a pixel and each adds its population there, so millions of cells cost
 * as many steps as there are pixels with something in them.
 */
export function paintHash(h: Hashlife, view: LifeView, W: number, H: number, opts: { background: number; color: number }): Painted {
  const bg = opts.background,
    col = opts.color;
  if (view.scale >= 1) {
    const cx0 = Math.floor(view.x),
      cy0 = Math.floor(view.y);
    const cw = Math.ceil(W / view.scale) + 2,
      ch = Math.ceil(H / view.scale) + 2;
    const data = new Uint8ClampedArray(cw * ch * 4);
    fill(data, bg);
    for (const [x, y] of h.cells({ x0: cx0, y0: cy0, x1: cx0 + cw - 1, y1: cy0 + ch - 1 })) put(data, ((y - cy0) * cw + (x - cx0)) * 4, col);
    return { data, w: cw, h: ch, left: (cx0 - view.x) * view.scale, top: (cy0 - view.y) * view.scale, px: view.scale };
  }
  const n = W * H,
    count = new Float64Array(n);
  const s = view.scale;
  // nodes no bigger than a pixel: the largest power of two that fits in one
  const min = 2 ** Math.floor(Math.log2(1 / s));
  h.visit({ x0: view.x, y0: view.y, x1: view.x + W / s, y1: view.y + H / s }, min, (x, y, size, pop) => {
    const px = Math.floor((x + size / 2 - view.x) * s),
      py = Math.floor((y + size / 2 - view.y) * s);
    if (px >= 0 && py >= 0 && px < W && py < H) count[py * W + px] += pop;
  });
  const data = new Uint8ClampedArray(n * 4);
  fill(data, bg);
  const perPixel = 1 / (s * s);
  const br = bg >>> 16,
    bgG = (bg >>> 8) & 255,
    bb = bg & 255;
  const r = col >>> 16,
    g = (col >>> 8) & 255,
    b = col & 255;
  for (let i = 0; i < n; i++) {
    const k = count[i];
    if (!k) continue;
    const a = 0.45 + 0.55 * Math.sqrt(Math.min(1, k / perPixel));
    const o = i * 4;
    data[o] = r * a + br * (1 - a);
    data[o + 1] = g * a + bgG * (1 - a);
    data[o + 2] = b * a + bb * (1 - a);
  }
  return { data, w: W, h: H, left: 0, top: 0, px: 1 };
}

/** a canvas the size of a painted image, kept between frames */
export interface Scratch {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
}

/**
 * Draws the world on a 2D context of W by H CSS pixels: the cells, and close up a dark line between them (the grid,
 * from 6 pixels a cell when `grid` is on, else only the gap).
 */
export function drawLife(ctx: CanvasRenderingContext2D, w: LifeWorld, view: LifeView, W: number, H: number, opts: PaintOpts & { grid: boolean; gridColor: string }, scratch: Scratch) {
  drawPainted(ctx, paintLife(w, view, W, H, opts), view, W, H, opts, scratch);
}

/** Draws a Hashlife plane the same way, in one colour. */
export function drawHash(ctx: CanvasRenderingContext2D, h: Hashlife, view: LifeView, W: number, H: number, opts: { background: number; color: number; grid: boolean; gridColor: string }, scratch: Scratch) {
  drawPainted(ctx, paintHash(h, view, W, H, opts), view, W, H, opts, scratch);
}

/** Puts painted pixels on a canvas, scaled up crisp close in, with the line between cells. */
export function drawPainted(ctx: CanvasRenderingContext2D, p: Painted, view: LifeView, W: number, H: number, opts: { background: number; grid: boolean; gridColor: string }, scratch: Scratch) {
  const img = new ImageData(p.data as unknown as Uint8ClampedArray<ArrayBuffer>, p.w, p.h);
  if (p.px === 1 && p.left === 0 && p.top === 0) {
    ctx.putImageData(img, 0, 0);
    return;
  }
  let c = scratch.canvas;
  if (!c || c.width < p.w || c.height < p.h) {
    c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(Math.max(p.w, 64), Math.max(p.h, 64)) : Object.assign(document.createElement("canvas"), { width: Math.max(p.w, 64), height: Math.max(p.h, 64) });
    scratch.canvas = c;
  }
  const cc = c.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  cc.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c as CanvasImageSource, 0, 0, p.w, p.h, p.left, p.top, p.w * p.px, p.h * p.px);
  // the line between cells: the background's gap from 4 pixels a cell, the grid's colour when it is on
  const s = view.scale;
  if (s >= 4) {
    const bg = opts.background;
    ctx.strokeStyle = opts.grid && s >= 6 ? opts.gridColor : `rgb(${bg >>> 16},${(bg >>> 8) & 255},${bg & 255})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = Math.ceil(view.x); (gx - view.x) * s <= W; gx++) {
      const X = Math.round((gx - view.x) * s) + 0.5;
      ctx.moveTo(X, 0);
      ctx.lineTo(X, H);
    }
    for (let gy = Math.ceil(view.y); (gy - view.y) * s <= H; gy++) {
      const Y = Math.round((gy - view.y) * s) + 0.5;
      ctx.moveTo(0, Y);
      ctx.lineTo(W, Y);
    }
    ctx.stroke();
  }
}
