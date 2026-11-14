# lifeworldjs

The Game of Life engine of [destbreso.com](https://destbreso.com/interactive/game-of-life), in TypeScript with no dependencies: an unbounded plane where every cell keeps the colour it was born in, its age and how long it has lived, Gosper's HashLife for leaps of millions of generations, rules as Golly writes them, Golly's History and Super families, RLE files, a painter for a canvas, and the OTCA metapixel.

## Where it comes from

My site has a Game of Life lab, and its cells have always had colours: you draw a pattern in one colour and another in a different one, and where they meet, each newborn cell takes the average of its parents. That idea shaped everything after it. A cell is not only alive or dead here: it has a colour it passes on, an age, and a heat, the generations it has lived in all its lives, which the lab can show as a map of where life has been.

The first engine kept the live cells in a map, keyed by their coordinates, and stepped them one by one. In October 2026 I rewrote it as this one: tiles of 32 by 32 cells, a row of a tile in one 32-bit word, a generation computed 32 cells at a time with a bit-sliced adder, and only the tiles where something can change computed at all. The colours stayed exactly as they were; the tests still run the old stepper beside the new one and compare every colour. HashLife came the same day, for leaping far ahead.

A week later came the OTCA metapixel, a pattern that behaves as one cell of Life, built exactly as Golly's metafier script builds it. The rest came from people. Patterns posted on the ConwayLife Discord used rules I did not run, so the engine learned Hensel's notation and MAP rules, and Golly's History and Super, where cells carry marks and trails drawn by hand. Since then the rules and the families are checked against Golly's own bgolly, cell for cell.

Later I wrote a faster engine, in Rust, and the site is moving to its WebAssembly build. This package keeps the TypeScript engine as the site used it, and it is the reference: that build is checked against it, result for result, before the site trusts it.

## Install

```sh
npm install lifeworldjs
```

It runs in any JavaScript runtime, in a page or in Node; only `drawLife` and `drawHash` need a canvas.

## A first world

```ts
import { CONWAY, LifeWorld } from "lifeworldjs";

const w = new LifeWorld(CONWAY);
// a glider, in the site's cyan
for (const [x, y] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) w.set(x, y, 0x22d3ee);
for (let g = 0; g < 4; g++) w.step();
console.log(w.generation, w.population, w.bounds()); // 4 5 { x0: 1, y0: 1, x1: 3, y1: 3 }
```

## Examples from the site

Each of these is a way the lab uses the engine, and each but the canvas runs as a test (`test/readme.test.ts`), so what it prints is what it gives.

### Colours that mix

The lab draws in colours. A newborn cell takes the mean of its live parents' colours, each channel rounded on its own.

```ts
const w = new LifeWorld(CONWAY);
w.set(0, 0, 0xff0000); // red
w.set(1, 0, 0xffffff); // white
w.set(2, 0, 0x0000ff); // blue
w.step();
// the blinker turns: the middle cell keeps its white, the two newborns take the mean of red, white and blue
console.log(w.get(1, -1).toString(16), w.get(1, 0).toString(16), w.get(1, 1).toString(16)); // aa55aa ffffff aa55aa
console.log(w.get(0, 0)); // -1: dead
```

### Age and heat

The lab's age and heat views read these. A cell's age counts the generation it was born in as 1; its heat adds every generation it has lived in all its lives.

```ts
const w = new LifeWorld();
for (const [x, y] of [[0, 0], [1, 0], [2, 0]]) w.set(x, y, 0x22d3ee);
for (let g = 0; g < 10; g++) w.step();
const t = w.getTile(0, 0)!;
console.log(w.generation, w.age(t, 1), w.heatOf(t, 1)); // 10 11 11: the blinker's middle cell never died
console.log(w.heatOf(t, 0)); // 6: the end cell, alive every other generation
```

A cell's index in its tile is `y * 32 + x`, its coordinates within the tile.

### A pattern from a file

Patterns come into the lab as RLE, the format LifeWiki and Golly use.

```ts
import { liveCells, parseRLE } from "lifeworldjs";

const gun = parseRLE(`#N Gosper glider gun
x = 36, y = 9, rule = B3/S23
24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!`);
const w = new LifeWorld();
for (const [x, y] of liveCells(gun)) w.set(x, y, 0xfacc15);
for (let g = 0; g < 300; g++) w.step();
console.log(gun.name, gun.width, gun.height, w.population, w.last); // Gosper glider gun 36 9 86 { births: 36, deaths: 43 }
```

### Going to a generation far ahead

The lab's "go to generation" leaps with HashLife, a binary digit of the distance at a time, so a million generations are twenty leaps. HashLife keeps no colours: the lab paints it in one.

```ts
import { Hashlife } from "lifeworldjs";

const h = new Hashlife(CONWAY);
h.load([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]);
let left = 1_000_000;
while (left > 0) {
  const j = Math.floor(Math.log2(left));
  h.step(j); // 2^j generations
  left -= 2 ** j;
}
console.log(h.generation, h.population, h.bounds()); // 1000000 5 { x0: 250000, y0: 250000, x1: 250002, y1: 250002 }
```

### A rule from the Discord

This rule came with a pattern someone posted. A rule by the shape of the neighbours is read into a table of 512, one entry for each 3 by 3 neighbourhood; `parseRule` says why when it cannot run a rule.

```ts
import { parseRule } from "lifeworldjs";

const rule = parseRule("B2e3air4k5ckn6n/S1c23-knqy4ery5ekn6a7c");
if ("error" in rule) throw new Error(rule.error);
console.log(rule.birth, rule.survival, rule.table?.length); // [2, 3, 4, 5, 6] [1, 2, 3, 4, 5, 6, 7] 512
const w = new LifeWorld(rule);
console.log(parseRule("B0/S8")); // { error: "a birth from no neighbours (B0) is not run here" }
```

### Golly's History

Under History a cell that dies leaves state 2 behind, so a moving pattern draws its own trail, as in Golly.

```ts
const w = new LifeWorld();
w.setFamily("History");
for (const [x, y] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) w.set(x, y, 0xffffff);
for (let g = 0; g < 8; g++) w.step();
console.log(w.population, w.markedCount(), w.getState(3, 4), w.getState(0, 2)); // 5 10 1 2
```

### What a pattern is

The lab names a group of cells by running it and seeing what it does.

```ts
import { analyze, separate } from "lifeworldjs";

console.log(analyze([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]])); // { kind: "ship", period: 4, dx: 1, dy: 1, from: 0 }
console.log(analyze([[0, 0], [1, 0], [2, 0]])); // { kind: "oscillator", period: 2, from: 0 }
console.log(separate([[0, 0], [1, 0], [0, 1], [10, 10], [11, 10]]).map((o) => o.cells.length)); // [3, 2]
```

### Life running Life

A glider of OTCA metapixels, each metapixel a 2048 by 2048 pattern that behaves as one cell. A meta generation takes 35,328 generations, and the first only sends each metapixel's first signals, so after five the glider has moved one metapixel down and to the right. The board has some 775,000 live cells and is built straight into HashLife's tree, never listed.

```ts
import { META_PERIOD, metafyInto, metaStates } from "lifeworldjs";

const h = new Hashlife(CONWAY);
metafyInto(h, [
  [0, 1, 0, 0, 0],
  [0, 0, 1, 0, 0],
  [1, 1, 1, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
]);
let left = 5 * META_PERIOD;
while (left > 0) {
  const j = Math.floor(Math.log2(left));
  h.step(j);
  left -= 2 ** j;
}
console.log(h.generation, metaStates((box) => h.count(box), 5, 5));
// 176640 [[0,0,0,0,0], [0,0,1,0,0], [0,0,0,1,0], [0,1,1,1,0], [0,0,0,0,0]]
```

Outside the rows you give there are no metapixels, which the ones on the edge read as dead: give a pattern room to move.

### On a canvas

```ts
import { drawLife, paintLife } from "lifeworldjs";

// close up: 8 screen pixels a cell, the world point (-2, -2) at the top-left corner
const p = paintLife(w, { x: -2, y: -2, scale: 8 }, 640, 480, { mode: "color", background: 0x0b0e14 });
// p.data is RGBA, p.w by p.h, each of its pixels p.px screen pixels across; or straight onto a 2D context:
const scratch = {};
drawLife(ctx, w, { x: -2, y: -2, scale: 8 }, 640, 480, { mode: "heat", background: 0x0b0e14, grid: true, gridColor: "#1f2937" }, scratch);
```

Zoomed out (a scale below 1), each screen pixel shows the mean colour of the cells in it, brighter the denser they are, so a lone glider far out is still a dot.

## API

Coordinates are integers, x to the east and y to the south; a point between cells reads the cell it is in. Colours are `0xRRGGBB` numbers.

### LifeWorld

`new LifeWorld(rule = CONWAY)`: an empty plane under a rule.

- `set(x, y, color)`: draws a cell alive in a colour, or erases it with a negative colour. A cell more than `LIMIT` (33,554,400) from the origin in either coordinate is not drawn.
- `get(x, y)`: a live cell's colour, or -1.
- `step()`: one generation; returns `{ births, deaths }`, also kept in `last`.
- `generation`, `population`: numbers; `generation` may be written, which changes no cell and moves every age and heat with it.
- `cells()`: every live cell as `[x, y, color]`, tiles in the order they were made, each row by row.
- `cellsIn(x0, y0, x1, y1)`: the live cells in a box, both ends in it. `popIn(x0, y0, x1, y1)`: the live cells of the tiles a box touches, cheap however many there are (exact when the box is tile-aligned).
- `bounds()`: `{ x0, y0, x1, y1 }` of the live cells, or under a family of every cell with a state; `null` when there is none.
- `age(tile, i)` and `heatOf(tile, i)`: a cell's age (1 in the generation it is born) and heat, `tile` from `getTile(tx, ty)` (`tx = Math.floor(x / 32)`) and `i = (y - 32 * ty) * 32 + (x - 32 * tx)`.
- `tiles`: the `Map` of tiles, keyed by `tileKey(tx, ty)`. A `Tile` has `tx`, `ty`, `bits` (32 rows, bit x the cell at column x), `color`, `born`, `heat` (1,024 each, indexed `y * 32 + x`), `pop`, and under a family `state`. A painter reads these directly; change them only through the world.
- `keepEmpty` (512): a tile with no live cell for this many generations is let go, and the heat of its cells with it.
- `rule`, `setRule(rule)`: the rule (`{ birth, survival, table?, name? }`), changed without touching a cell.
- `setFamily("History" | "Super" | null)`, `family`: Golly's states over the rule, or none. Coming from none a live cell is state 1; from Super to History states map down as Golly maps them.
- `getState(x, y)`, `setState(x, y, state, color?)`, `markedCount()`: a cell's state (under no family 1 or 0), setting one, and how many dead cells carry a state.
- `clear()`: no cell, generation 0; the rule, the family and `keepEmpty` kept.

Also: `TILE` (32), `LIMIT`, `DEFAULT_COLOR` (0x22d3ee, a birth with no parent), `CONWAY`, `ruleString(rule)`, `tileKey(tx, ty)`, and `digest(world)`, a number for where every live cell is, the same whatever order the tiles were made in.

### Hashlife

`new Hashlife(rule = CONWAY)`: a quadtree plane, its root centred on (0, 0). Cells are alive or dead: no colours or states.

- `load(cells)`: the plane emptied and filled with `[x, y]` cells. `set(x, y, alive)`, `get(x, y)`: one cell (the plane grows to hold it).
- `step(j = 0)`: leaps 2^j generations. `generation` (writable) and `population`.
- `cells(box?)`: the live cells as `[x, y]`, in the tree's order (at every level a square's north-west, north-east, south-west and south-east quarters in turn); `count(box)`: how many there are in a box, cheap for large boxes; `bounds()`.
- `visit(box, minSize, fn)`: every square down to `minSize` cells across with a live cell in the box, `fn(x, y, size, population)`, in the tree's order: how a painter draws millions of cells at a distance.
- `setRule(rule)`, `clear()`, `collect()` (keeps what the root uses, changes no cell), `limit` (nodes made before a leap collects, 4,000,000), `nodes`.
- Building a tree by hand: `node(nw, ne, sw, se)` (the one node with those four children), `empty(level)`, `alive` and `dead` (the two single cells), `expand(node)`, and `root`, which may be read and written. A node has `level` (2^level cells a side), `pop`, `nw`, `ne`, `sw`, `se`. `successor(node, j)` is a node's centre 2^j generations on.

### Rules

- `parseRule(text)`: a rule as Golly writes it, counts (`B3/S23`, `23/3`, `Life`), Hensel's letters (`B2e3air/S1c23-knqy`) or `MAP` and base64, into `{ birth, survival, table?, name }`, or `{ error }` with the reason. B0, bounded grids, Generations and other neighbourhoods are refused.
- `mapOf(table)`: a table of 512 written as a MAP rule. `HENSEL`: the letters, in Golly's order.
- Golly's families: `splitFamily(rule)` (`"LifeHistory"` to `{ base: "B3/S23", family: "History" }`), `familyRule(base, family)`, `FAMILY_STATES`, `STATE_COLORS` and `STATE_NAMES` (Golly's colours and names of each state), and `nextState(family, state, typeMask, alive)`, a cell's next state as Golly computes it.

### Files

- `parseRLE(text)`: `{ cells: [x, y, state][], width, height, rule?, name?, author?, comments }`, a file's `#N`, `#O` and `#C` lines read; `liveCells(parsed, rule?)` its live cells (under a family only the odd states). `formatRLE(cells, { rule?, name?, author?, comments? })` writes one, lines kept under 70 characters.
- `rleToPattern(text)` and `patternToRle(matrix, rule?)`: two states as a dense 0/1 matrix and back. `looksLikeRLE(text)`, `baseRule(rule)`.

### Looking at patterns

- `analyze(cells, { rule?, maxGen = 400, gunMaxPeriod? })`: `{ kind: "still" }`, `"oscillator"` with its period, `"ship"` with period and displacement, `"dies"` with when, `"gun"` with period and growth, or `"unknown"`. `settles(cells, maxGen, hold = 200, rule?)`: the generation a pattern's population holds from, or -1. `worldOf(cells, rule?)`, `shapeOf(world)`.
- `separate(cells, reach = 2)`: the cells as objects, `{ cells, x0, y0, x1, y1 }`, two cells within `reach` in the same one.

### Painting

- `paintLife(world, view, W, H, { mode, background, ink? })`: the pixels of a screen of W by H for a view `{ x, y, scale }` (the world point at the top-left corner, screen pixels a cell). `mode` is `"color"`, `"age"` or `"heat"`; `ink` maps a cell's colour as it is drawn. It returns `{ data, w, h, left, top, px }`, an RGBA image and where it goes on the screen. Under a family, cells are drawn in Golly's colours of their states.
- `paintHash(hashlife, view, W, H, { background, color })`: the same for a Hashlife, in one colour.
- `drawLife`, `drawHash`, `drawPainted`: the same onto a `CanvasRenderingContext2D`, crisp close up with a line between cells (`grid` adds it from 6 pixels a cell), and a `scratch` object kept between frames.

### Metapixels

- `metafy(rows, rule?)`: a pattern of 1s and 0s (rows, y down) as the cells of a metapixel for each, metapixel (i, j) at (2048 i, 2048 j). `metafyInto(hashlife, rows, rule?)`: the same board built straight into a Hashlife.
- `metaStates(count, cols, rows)`: each metapixel ON or OFF, read off its face with a counting function such as `box => hashlife.count(box)`; `faceOf(i, j)`, `metapixels(rule?)`, `META_SIZE` (2048), `META_PERIOD` (35,328).

## How it is checked

`npm test` runs every test the site ran: the tiled engine against the sparse stepper the site used before it, colour for colour; HashLife against the tiled engine, cell for cell, and through a leap of a million cells; rules by shape against the tiled engine and HashLife alike, both families against a plain reading of Golly's step, and all of them against Golly's own bgolly when it is installed (`GOLLY_BGOLLY`, or Golly 5.0's macOS folder; skipped where it is not); the OTCA metapixel against LifeWiki's file; RLE read and written back; and the examples above.

## What it does not do

No B0 rules, bounded grids, Generations rules, or neighbourhoods other than Moore's. No Investigator family. HashLife keeps no colours and no states. The plane ends 33,554,400 cells from the origin; a glider takes 134 million generations to get there.

## Licence

GPL-2.0-or-later. Two of its parts follow Golly's own code closely: the rules (Golly's `liferules.cpp`) and the History and Super families (`superalgo.cpp`), and the metapixel is built as Golly's `metafier.py` builds it. Golly is GPL, so this is too.
