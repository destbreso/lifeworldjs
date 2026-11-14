// sim/life/objects: a board's live cells as separate objects, each a group of cells close enough to act on each other
// within a generation or two (two cells apart or less), with its box. What the finder walks through on the Game of
// Life's board; any Life-like simulation can use it.

export type ObjCell = [number, number];

export interface LifeObject {
  cells: ObjCell[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The cells as objects: two cells within `reach` of each other (across and down) are in the same one. Union-find over
 * a map of the cells, so a board of a hundred thousand cells takes a fraction of a second.
 */
export function separate(cells: Iterable<ObjCell>, reach = 2): LifeObject[] {
  const list: ObjCell[] = [];
  const at = new Map<number, number>();
  // (a key exact for coordinates within 2^20 of the origin, far wider than any board the colour engine holds)
  const key = (x: number, y: number) => (x + 1_048_576) * 2_097_152 + (y + 1_048_576);
  for (const c of cells) {
    at.set(key(c[0], c[1]), list.length);
    list.push([c[0], c[1]]);
  }
  const up = new Int32Array(list.length);
  for (let i = 0; i < up.length; i++) up[i] = i;
  const find = (i: number) => {
    while (up[i] !== i) {
      up[i] = up[up[i]];
      i = up[i];
    }
    return i;
  };
  list.forEach(([x, y], i) => {
    // (only the neighbours before this cell in reading order: each pair is joined once)
    for (let dy = -reach; dy <= 0; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        if (dy === 0 && dx >= 0) break;
        const j = at.get(key(x + dx, y + dy));
        if (j === undefined) continue;
        const a = find(i),
          b = find(j);
        if (a !== b) up[a] = b;
      }
  });
  const groups = new Map<number, LifeObject>();
  list.forEach((c, i) => {
    const r = find(i);
    let o = groups.get(r);
    if (!o) groups.set(r, (o = { cells: [], x0: c[0], y0: c[1], x1: c[0], y1: c[1] }));
    o.cells.push(c);
    if (c[0] < o.x0) o.x0 = c[0];
    if (c[0] > o.x1) o.x1 = c[0];
    if (c[1] < o.y0) o.y0 = c[1];
    if (c[1] > o.y1) o.y1 = c[1];
  });
  return [...groups.values()];
}
