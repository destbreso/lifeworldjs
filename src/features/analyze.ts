// What a pattern does, found by running it on a LifeWorld: it stays still, oscillates, travels (a spaceship, with its
// period and displacement), dies, settles after a while, or grows. A gun is told by its core coming back while its
// population climbs. Meant for small patterns: it keeps a key of every generation it looks at.

import { LifeWorld, type Rule, CONWAY } from "../core/tiled";

export type Behavior =
  | { kind: "still" }
  | { kind: "oscillator"; period: number; from: number }
  | { kind: "ship"; period: number; dx: number; dy: number; from: number }
  | { kind: "dies"; at: number }
  | { kind: "gun"; period: number; growth: number }
  | { kind: "unknown"; population: number };

export type Cells = Iterable<[number, number]>;

export function worldOf(cells: Cells, rule: Rule = CONWAY) {
  const w = new LifeWorld(rule);
  for (const [x, y] of cells) w.set(x, y, 0xffffff);
  return w;
}

/** A generation's shape, wherever it is: its cells from its bounding box's corner, and that corner. */
export function shapeOf(w: LifeWorld): { key: string; x0: number; y0: number } {
  const b = w.bounds();
  if (!b) return { key: "", x0: 0, y0: 0 };
  const cells: number[] = [];
  const width = b.x1 - b.x0 + 1;
  for (const [x, y] of w.cells()) cells.push((y - b.y0) * width + (x - b.x0));
  cells.sort((a, c) => a - c);
  return { key: `${width}:${cells.join(",")}`, x0: b.x0, y0: b.y0 };
}

/**
 * Runs the pattern up to `maxGen` generations and says what it does. A pattern that never repeats is checked for a
 * gun: its starting box (with a margin) coming back every `period` while the population grows by the same amount.
 */
export function analyze(cells: Cells, opts: { rule?: Rule; maxGen?: number; gunMaxPeriod?: number } = {}): Behavior {
  const rule = opts.rule ?? CONWAY;
  const maxGen = opts.maxGen ?? 400;
  const w = worldOf(cells, rule);
  const seen = new Map<string, { g: number; x0: number; y0: number }>();
  const first = shapeOf(w);
  seen.set(first.key, { g: 0, x0: first.x0, y0: first.y0 });
  const pops = [w.population];
  for (let g = 1; g <= maxGen; g++) {
    w.step();
    pops.push(w.population);
    if (!w.population) return { kind: "dies", at: g };
    const s = shapeOf(w);
    const prev = seen.get(s.key);
    if (prev) {
      const period = g - prev.g,
        dx = s.x0 - prev.x0,
        dy = s.y0 - prev.y0;
      if (dx || dy) return { kind: "ship", period, dx, dy, from: prev.g };
      if (period === 1 && prev.g === 0) return { kind: "still" };
      return { kind: "oscillator", period, from: prev.g };
    }
    seen.set(s.key, { g, x0: s.x0, y0: s.y0 });
  }
  // a gun: the population climbs by the same amount every period
  const maxP = opts.gunMaxPeriod ?? 200;
  const tail = pops.slice(Math.floor(pops.length / 2));
  for (let p = 1; p <= Math.min(maxP, Math.floor(tail.length / 3)); p++) {
    const d = tail[tail.length - 1] - tail[tail.length - 1 - p];
    if (d <= 0) continue;
    let ok = true;
    for (let i = tail.length - 1; i - p >= 0; i--)
      if (tail[i] - tail[i - p] !== d) {
        ok = false;
        break;
      }
    if (ok) return { kind: "gun", period: p, growth: d };
  }
  return { kind: "unknown", population: w.population };
}

/** The generation a pattern settles (its population holds at `pop` from then on, for `hold` generations), or -1. */
export function settles(cells: Cells, maxGen: number, hold = 200, rule: Rule = CONWAY): { at: number; pop: number } {
  const w = worldOf(cells, rule);
  const pops = [w.population];
  for (let g = 1; g <= maxGen + hold; g++) {
    w.step();
    pops.push(w.population);
  }
  // the last change of population before the end, period 2 allowed for blinkers' phases
  const end = pops.length - 1;
  let at = end;
  while (at > 0 && (pops[at - 1] === pops[end] || pops[at - 1] === pops[end - 1]) && (pops[at - 1] === pops[at] || pops[at - 1] === pops[Math.min(end, at + 1)])) at--;
  if (end - at < hold) return { at: -1, pop: pops[end] };
  return { at, pop: pops[end] };
}
