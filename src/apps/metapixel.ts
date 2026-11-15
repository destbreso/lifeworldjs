// Brice Due's OTCA metapixel (2006): a 2048 by 2048 Life pattern that behaves as one cell of any Life-like rule, a
// meta generation every 35,328 generations, and the metafier that tiles it into a pattern run at the meta level.
// Built as Golly's own script builds it, Scripts/Python/metafier.py (Dave Greene, 2006, after Brice Due's slides at
// otcametapixel.blogspot.com), its subpatterns, placements and comments kept as they are there:
// https://sourceforge.net/p/golly/code/ci/master/tree/Scripts/Python/metafier.py

import { Hashlife, type HNode } from "../core/hashlife";
import { CONWAY, type Rule } from "../core/tiled";

/** a metapixel's side, in cells */
export const META_SIZE = 2048;
/** the generations of one meta generation */
export const META_PERIOD = 35_328;

// glife's matrices (Scripts/Python/glife/__init__.py): x' = x0 + x * axx + y * axy, y' = y0 + x * ayx + y * ayy
type Matrix = readonly [number, number, number, number];
const identity: Matrix = [1, 0, 0, 1];
const flip: Matrix = [-1, 0, 0, -1];
const flip_y: Matrix = [1, 0, 0, -1];
const swap_xy_flip: Matrix = [0, -1, -1, 0];
const rcw: Matrix = [0, -1, 1, 0];

/** Golly's parse of an RLE string (wxpython.cpp, py_parse): whitespace is ignored, and any letter but b and o too. */
function parse(rle: string, x0: number, y0: number, [axx, axy, ayx, ayy]: Matrix): number[] {
  const out: number[] = [];
  let x = 0,
    y = 0,
    prefix = 0;
  for (const c of rle) {
    if (c >= "0" && c <= "9") {
      prefix = 10 * prefix + (c.charCodeAt(0) - 48);
      continue;
    }
    const n = prefix || 1;
    prefix = 0;
    if (c === "!") break;
    if (c === "$") {
      x = 0;
      y += n;
    } else if (c === "b") x += n;
    else if (c === "o") for (let k = 0; k < n; k++, x++) out.push(x0 + x * axx + y * axy, y0 + x * ayx + y * ayy);
  }
  return out;
}

/** n generations of Life on a flat cell list, leapt by HashLife a binary digit at a time */
function evolve(xy: number[], n: number): number[] {
  const h = new Hashlife(CONWAY);
  const cells: [number, number][] = [];
  for (let i = 0; i < xy.length; i += 2) cells.push([xy[i], xy[i + 1]]);
  h.load(cells);
  for (let left = n; left > 0; ) {
    const j = Math.floor(Math.log2(left));
    h.step(j);
    left -= 2 ** j;
  }
  return h.cells().flat();
}

/** glife's pattern: a cell list (x, y pairs, a cell possibly twice, as golly.join leaves them), its phases remembered */
class Pat {
  private phases = new Map<number, Pat>();
  constructor(readonly xy: number[]) {}
  /** pattern(x, y, A): transformed by A, then moved by (x, y) */
  at(x: number, y: number, [axx, axy, ayx, ayy]: Matrix = identity): Pat {
    const out = new Array<number>(this.xy.length);
    for (let i = 0; i < this.xy.length; i += 2) {
      out[i] = x + this.xy[i] * axx + this.xy[i + 1] * axy;
      out[i + 1] = y + this.xy[i] * ayx + this.xy[i + 1] * ayy;
    }
    return new Pat(out);
  }
  /** pattern[n]: n generations on */
  gen(n: number): Pat {
    if (!n) return this;
    let p = this.phases.get(n);
    if (!p) this.phases.set(n, (p = new Pat(evolve(this.xy, n))));
    return p;
  }
}
const P = (rle = "", x = 0, y = 0, A: Matrix = identity) => new Pat(parse(rle, x, y, A));
const join = (...ps: Pat[]) => new Pat(ps.flatMap((p) => p.xy));

/** The OFF and ON cells, before a rule is programmed: metafier.py's construction, statement for statement. */
function build(): { off: number[]; on: number[] } {
  // slide #21: programmables --------------------

  const LWSS = P("b4o$o3bo$4bo$o2bo!", 8, 0);

  const DiagProximityFuse = P(`
      bo$obo$bo2$4b2o$4b2o$59b2o$59b2o3$58b2o2b2o$9b2o3bo5bo5bo5bo5bo5bo5bo
      7b2o2b2o$9bo3bobo3bobo3bobo3bobo3bobo3bobo3bobo$10bo2bo2bo2bo2bo2bo2bo
      2bo2bo2bo2bo2bo2bo2bo2bo$11bobo3bobo3bobo3bobo3bobo3bobo3bobo3bo5b2o$
      12bo5bo5bo5bo5bo5bo5bo5bo3bobo$55bo2bo$56bobo$57bo!
      `, -5, -5);

  const OrthoProximityFuse = P("2o41b2o$2o41bo$41bobo$41b2o!", 1001, 0);

  const ProximityFuses = join(LWSS, DiagProximityFuse, OrthoProximityFuse);

  let AllFuses = P();
  for (let i = 0; i < 4; i++) { // place four sets of fuses around cell perimeter
    AllFuses = join(AllFuses.at(2047, 0, rcw), ProximityFuses);

  }
  let temp = P("o$3o$3bo$2bo!"); // broken eater
  temp = join(temp, temp.at(0, 10), temp.at(0, 20));
  temp = join(temp, temp.at(0, 46), temp.at(0, 92));
  const TableEaters = join(temp.at(145, 1401), temp.at(165, 1521, flip));

  const HoneyBitsB = P(`
      bo$obo$obo$bo7$bo$obo$obo$bo7$bo$obo$obo$bo23$bo$obo$obo$bo7$bo$obo$ob
      o$bo7$bo$obo$obo$bo23$bo$obo$obo$bo7$bo$obo$obo$bo7$bo$obo$obo$bo!
      `, 123, 1384);
  const HoneyBitsS = HoneyBitsB.at(57, 34);

  temp = P("2bobo2$obobo2$obo2$obo2$2bobo4$obo2$obobo2$2bobo!");
  const S = join(temp, temp.at(10, 16, flip)); // just practicing...
  const B = join(S, P("o6$8bobo2$o2$obo6$o!")); // ditto
  temp = P("2bobo2$obobo2$obo2$obo2$obo2$obo2$obo2$obobo2$2bobo!");
  const O = join(temp, temp.at(10, 16, flip));
  temp = P("obo2$obo2$obobo2$obobo2$obo2bo2$obo2$obo2$obo2$obo!");
  const N = join(temp, temp.at(10, 16, flip));
  temp = P("obobobobo2$obobobobo2$obo2$obo2$obo2$obo!");
  const F = join(temp, temp.at(0,6)); // overlap, just to try it out...

  const Eatr = P("4bobo2$".repeat(2) + "obo2$".repeat(2) + "4bobobobobobo2$".repeat(2) + "12bobo2$".repeat(2));
  const Eater = join(Eatr, P("obo2$".repeat(2)));
  const LabelDigits = P(`
      obobo2$o3bo2$obobo2$o3bo2$obobo5$obobo2$4bo2$4bo2$4bo2$4bo5$obobo2$o2$
      obobo2$o3bo2$obobo12$obobo2$o2$obobo2$4bo2$obobo5$o3bo2$o3bo2$obobo2$
      4bo2$4bo5$obobo2$4bo2$obobo2$4bo2$obobo12$obobo2$4bo2$obobo2$o2$obobo
      5$2bo2$2bo2$2bo2$2bo2$2bo5$obobo2$o3bo2$o3bo2$o3bo2$obobo!`);
  const VLine = P("o2$".repeat(25));
  const VLine2 = P("o2$".repeat(71));
  const HLine = P("ob".repeat(38));

  let TableLabels = join(VLine.at(18, 1440), VLine.at(96, 1440), Eater.at(77, 1446), HLine.at(20, 1440), HLine.at(20, 1488), O.at(39, 1444), N.at(55, 1444), O.at(23, 1468), F.at(39, 1468), F.at(55, 1468), Eatr.at(77, 1470));
  TableLabels = join(TableLabels, P("ob".repeat(29) + "8bobobo", 120, 1533), HLine.at(118, 1391), VLine2.at(118, 1393), VLine2.at(192, 1393), B.at(123, 1410), B.at(123, 1456), B.at(123, 1502), S.at(177, 1398), S.at(177, 1444), S.at(177, 1490), LabelDigits.at(138, 1396), LabelDigits.at(168, 1401));

  let all = join(AllFuses, TableEaters, TableLabels, HoneyBitsB, HoneyBitsS);

  // slide 22: linear clock --------------------

  const LinearClockGun = P(`
      19bo$17b3o$16bo$16b2o$30bo$28b3o$27bo$27b2o$13b3o$12bo2b2o$11bo3b2o$
      12b3o$12b2o$15bo$13b2o$13b2o$2b2o5b2o2b2o$bobo9b2o8b2o$bo6b3o12b2o$2o
      8b4o$12b3o$12bob2o$11b2o2bo$11b2ob2o$12bobo$13bo2$6b2o$5bobo$5bo$4b2o$
      10b2o36bo6b2o$11bo37b2o4b2o$8b3o37b2o$8bo$57bo$15b2o39bobo$14bobo15b2o
      23bo$13b2obo15b2o24b3o63b2o$8bo5b2o44bo63b2o$6b3o6bo$5bo112bo5bo$6b3o
      6bo15b2o84b3o3b3o$8bo5b2o15b2o20b2o62bo2bobo2bo$13b2obo35b2ob2o62b2ob
      2o$14bobo18b3o15b4o$15b2o18bobo16b2o$35bobo$36bobo78bo7bo$38bo79bobobo
      bo$70bo47bobobobo$70b3o44bob2ob2obo$37bo35bo43b2o5b2o$37bo34b2o20b2o$
      59bo35bo$59b3o33bobo$62bo33b2o$61b2o4$28b2o7b2o11bo24bo$28bob2o3b2obo
      10b3o22b3o$28bo3bobo3bo9b2obo21b2o2bo41b2ob2o$28b2o2bobo2b2o9b3o21b2o
      3b2o11b2o28bobo$29b3o3b3o11b2o19bobo2bobo13bo10b3o8b2o5bobo$30bo5bo33b
      2o3b2o9b2o3bobo7bo2bo4bo3b2o6bo$65b2o19bobo3b2o6bo3bo3bobo$65b2o21bo
      11bo7bobo$25b2o13b2o46b2o13bo$25b2o2b2o5b2o2b2o58b2obo$29b2o5b2o$121b
      2o$103bob2o14bobo$103b3o17bo$40bo63bo18b2o$40bo2b2o72b2o$39bo5bo36b2o
      33bo$40bobo2b2o35bobo33b3o$27bo12bo3b2o38bo35bo$25b3o14b3o39b2o20b2o$
      24bo41b2o10b2o26bo$25b3o14b3o20bo2bo9bo28b3o$27bo12bo3b2o20b2o11b3o27b
      o$40bobo2b2o4b2o28bo$39bo5bo5b2o$40bo2b2o$40bo!
      `, 46, 1924);

  const Gap = "3bo7bo7bo$b3o5b3o5b3o$o7bo7bo$2o6b2o6b2o21$"; // string, not pattern!
  const LinearClockEaters = P("3bo$b3o$o$2o5$".repeat(36) + Gap + "3bo$b3o$o$2o5$".repeat(10) + "24$" + "3bo$b3o$o$2o5$".repeat(17) + Gap + "3bo$b3o$o$2o5$".repeat(42) + Gap + "3bo$b3o$o$2o5$3bo7bo$b3o5b3o$o7bo$2o6b2o13$" + "3bo$b3o$o$2o5$".repeat(30) + "8$" + "3bo$b3o$o$2o5$".repeat(2) + Gap + "16$" + "3bo$b3o$o$2o5$".repeat(11) + "8$" + "3bo$b3o$o$2o5$".repeat(19), 101, 422);
  const LinearClockCap = P(`
      3b2o13bo7bo$2bo2bo10b3o5b3o$bobobo9bo7bo14b2o$3obo10b2o6b2o13bobo$3o
      29bo6b3o$30b2ob2ob3ob2o$30b2ob2ob5o$32bo5bo$2b2o29b2ob2o$2b2o3$32bo5bo
      $31b2o5b2o$30bob2o3b2obo$30bob2o3b2obo$31b3o3b3o$31b3o3b3o10$33b2ob2o$
      34bobo$34bobo$35bo!
      `, 83, 401);
  all = join(all, LinearClockGun.gen(1840), LinearClockEaters, LinearClockCap);

  // slide 23: MWSS track --------------------

  const MWSS = P("b5o$o4bo$5bo$o3bo$2bo!", 521, 1973);

  const P46Osc = P(`
      40bo$31b2o5b3o$10b3o14b2o3bo4bo$10bo3bo12b2o3bobo3bo$3bo6bo4bo17bobo3b
      o$b3o7bo3bo18bo3b2o$o$b3o7bo3bo7b3o$3bo6bo4bo5b2obob2o$10bo3bo5bo5b2o$
      10b3o8b2obob2o$23b3o!`);

  const P46Gun = P(`
      31b2o$30b2o$31b5o9bo$16b3o13b4o9b3o$14bo3bo29bo$3bo9bo4bo13b4o9b3o$b3o
      9bo3bo13b5o9bo$o29b2o$b3o9bo3bo13b2o$3bo9bo4bo$14bo3bo$16b3o!`);

  const GliderToMWSS = join(P46Osc.at(449, 1963), P46Gun.at(474, 1981));
  // exact match would be P46Gun[46](474, 1981), but that glider is absorbed

  const StateBit = P("b2o$obo$bo!", 569, 1970);
  const Snake = P("2o$o$bo$2o!", 570, 1965);

  const BitKeeper = P(`
      15bobo2b2o19b2o$14bo3bob3o19bo$15bo6b2o15b3o$3bo12b5obo16bo$b3o15b3o$o
      $b3o15b3o$3bo12b5obo$15bo6b2o3b2o$14bo3bob3o4b2o$15bobo2b2o!
      `, 524, 1982);

  const GliderFromTheBlue = P(`
      23b2o$23bo2bobo$25b2ob3o$31bo$25b2ob3o$12bo3bo8b2obo$11bo5bo$17bo$3bo
      8bo3b2o$b3o9b3o$o$b3o9b3o19bo$3bo8bo3b2o7bo7b3o$17bo4bo2bob2o3bo$11bo
      5bo10bo4bo$12bo3bo10bo4b2o2$23b5o$24b4o$26bo!`);

  const GliderToLWSS = P(`
      3bo$2bobo$bo3bo3b2o$b5o3b2o$obobobo$bo3bo2$bo3bo$obobobo$b5o$bo3bo$2bo
      bo$3bo6$b3o5b3o$2ob2o3b2ob2o$2obobobobob2o$bo3bobo3bo$bo2bo3bo2bo$2b3o
      3b3o4$4b2ob2o$5bobo$5bobo$6bo!`, 663, 1931); // P46Osc really

  const ReflectLWSS = P(`
      b2o$b2o8$b3o3b3o$o2bo3bo2bo$2obo3bob2o14$3b2ob2o$4bobo$4bobo$5bo!
      `, 589, 1940);

  const ReflectLWSS2 = P(`
      15b2o3bo$15b3obob2o4b2o$15b3o4bo4b2o$3bo14bo3bo$b3o15b3o$o$b3o15b3o$3b
      o14bo3bo$15b3o4bo$15b3obob2o$15b2o3bo!`, 573, 1884); // P46Osc really

  const LWSStoBoat = P(`
      2o14b2o9b2o$2o15b2o8b2o$13b5o$13b4o2$3b2o8b4o$2bobob2o5b5o$b2o3b2o9b2o
      8b2o$2bobob2o8b2o9b2o$3b2o!`, 821, 1883); // P46Osc really

  const ReflectMWSS = P(`
      22b2o5b2o$18b2o2b2o5b2o2b2o$18b2o2b2o5b2o2b2o$22b3o3b3o$21bo2bo3bo2bo$
      25bobo$21b2o7b2o$21b2o7b2o$24bo3bo$24b2ob2o$22b3o3b3o$22b2o5b2o$22bo7b
      o10$b2o27b2o$b2o25b2ob2o$26bo2bobo$6bo3b2o14bo$2o2b2obob3o14bo4bo$2o2b
      o4b3o15bo3bo$4bo3bo15b2o2b3o$5b3o16b2o2$5b3o$4bo3bo$2o2bo4b3o13b2o$2o
      2b2obob3o13b2o$6bo3b2o2$b2o$b2o!`);

  const HoneyBit = P("b2o$o2bo$b2o!");
  let CornerSignalSystem = P();
  CornerSignalSystem = join(CornerSignalSystem, P(`
      4b2o4b3o$4b2o3bo3bo$9b2ob2o$10bobo2$10bobo$9b2ob2o$9bo3bo$10b3o9$3b3o
      5b3o$3bo2b2ob2o2bo$4b3o3b3o$5bo5bo4$2o13b2o$2o2b2o5b2o2b2o$4b2o5b2o!
      `, 70, 9)); // P46OscAlt1 really
  // include stopper for pattern corners, destroyed in the interior of
  // multi-cell metapatterns by the tub-LWSS-fuse combination
  CornerSignalSystem = join(CornerSignalSystem, P("5b2o$5b2o3$2o2b2o$2o2b2o!", 86, 1));
  CornerSignalSystem = join(CornerSignalSystem, P(`
      11b2o$11b2o12$4b3o3b3o$4b3o3b3o$3bob2o3b2obo$3bob2o3b2obo$4b2o5b2o$5bo
      5bo6$2o13b2o$2o2b2o5b2o2b2o$4b2o5b2o!`, 159, 0)); // P46OscAlt1 really

  let SignalSystem = P();
  for (let i = 0; i < 3; i++) { // place three sets of mechanisms to signal neighbors
    SignalSystem = join(SignalSystem.gen(32).at(2047, 0, rcw), HoneyBit.at(42, 111, rcw), ReflectMWSS.at(38, 46), GliderFromTheBlue.at(73, 52), CornerSignalSystem, HoneyBit.at(964, 40), GliderFromTheBlue.gen(12).at(953, 52));

  }
  // need to add the fourth (west) side separately because signal stops there,
  // so two-thirds of the pieces are customized or in slighly different locations
  // (could have started in SW corner and used range(0,4) for some of it,
  // but I happened to start in the NW corner and now I'm feeling lazy)

  // west edge:
  SignalSystem = join(SignalSystem, HoneyBit.at(48, 1086, rcw), P(`
      11b2o$12bo$12bob2o$13bobo$3bo$2bobo$2bobo$b2ob2o$4bo$b2o2bo7bo$2bo2bo
      7bobo$o8b3o$2o9b3o2bo$9b2o4b2o$13b2o6$8bo3bo$8bo3bo3$5b2obo3bob2o$6b3o
      3b3o$7bo5bo6$8b2ob2o$9bobo$9bobo$10bo!`, 52, 1059)); // GliderFromTheBlue really

  // southwest corner:
  SignalSystem = join(SignalSystem, P(`
      11b2o$12bo$12bob2o$13bobo$3bo$2bobo$2bobo$b2ob2o2$b2ob2o7b3o$2bob2o6bo
      2bo$o13b2o$2o9bo3bo$11bo2b2o$13bob2o9$5b2o7b2o$5bob2o3b2obo$5bo3bobo3b
      o$5b2o2bobo2b2o$6b3o3b3o$7bo5bo4$8b2ob2o$9bobo6b2o$9bobo7bo$10bo5b3o$
      16bo!`, 52, 1885)); // GliderFromTheBlue plus a terminating eater really
  SignalSystem = join(SignalSystem, P(`
      24b2o$24b2o3$2o14b3o6b2o$2o12bo3bo6b2o$13bo4bo$13bo3bo2$3b3o7bo3bo$b2o
      bob2o5bo4bo$b2o5bo5bo3bo6b2o$b2obob2o8b3o6b2o$3b3o2$24b2o$24b2o!
      `, 0, 1818)); // P46OscAlt1 really -- lengthened version of CornerSignalSystem
  SignalSystem = join(SignalSystem, P("2o$2o2b2o$4b2o3$4b2o$4b2o!", 1, 1955), P(`
      24b2o$24b2o2$14b3o$13bo4bo6b2o$12bo5bo6b2o$13bo$14b2o2$14b2o$13bo$2o
      10bo5bo6b2o$2o11bo4bo6b2o$14b3o2$24b2o$24b2o!`, 9, 1961)); // P46OscAlt1 really

  all = join(all, SignalSystem, GliderToMWSS, MWSS, Snake, BitKeeper);
  all = join(all, GliderFromTheBlue.at(607, 1953), GliderToLWSS, ReflectLWSS, ReflectLWSS2, LWSStoBoat);

  // all += StateBit # do this later on, when defining OFFcell and ONcell

  // slide 24: LWSS track --------------------
  // [phase adjusters and a bunch of honeybits]

  const PhaseAdjuster = join(P46Gun.at(2, 11, flip_y), P46Gun.gen(12).at(0, 32), P("o$3o$3bo$2b2o!", 0, 13), P("2b2o$bobo$bo$2o!", 2, 26)); // eaters really

  all = join(all, PhaseAdjuster.gen(43).at(1772,10), PhaseAdjuster.gen(26).at(2037, 1772, rcw));
  all = join(all, PhaseAdjuster.gen(43).at(269, 2037, flip), PhaseAdjuster.gen(9).at(58, 1203, swap_xy_flip));
  // the third adjuster was a different shape in the original metacell,
  // but one of the same shape could be substituted with no ill effects
  const LWSSPacketGun = P(`
      50b2o$52bo$37b2o10b2o2bo$37b2o11bo2bo$51bobo8bo$51b2o9b3o$65bo$40b2o9b
      2o9b3o$38bo3b2o7bobo8bo$38bo4bo6bo2bo$38bo3b2o5b2o2bo$40b2o10bo$50b2o
      5$52bo$52b3o$55bo$54b2o$41bo$41b3o$b2o5b2o34bo$b2o5b2o33b2o3$45b2o$43b
      o3bo5b2o9b2o$42bo5bo3bo2bo4b3o2bo$42bo4bo5bo4bo2b5o$42bo2bo7bo2b4o$43b
      obo8bob2o3bo$44bo8b2obob3o7b2o$55bo3bo8bobo$52b3o15bo$53bo16b2o$bo7bo$
      b2o5b2o$b3o3b3o$3b2ob2o45b2o$3bo3bo22b2o21b2o$2o7b2o20bo$2o7b2o17b3o$
      4bobo21bo35b2o$o2bo3bo2bo53bobo$b3o3b3o56bo$66b2o$60b2o$60bo$b2o25b2o
      31b3o$b2o25b2o33bo2$19b2o$17b2o2bo7b2o$17b6o6b2o$17b4o4$17b4o$17b6o6b
      2o$17b2o2bo7b2o$19b2o2$28b2o$12bobo13b2o$13b2o$13bo5$17b2o$17b2o19$49b
      o3b3o$48bobo2b5o3b2o$48bo3b2o3b2o2b2o$49bo2bo3b2o$50b3o3bo2$50b3o3bo$
      49bo2bo3b2o$34b2o12bo3b2o3b2o2b2o$34b2o12bobo2b5o3b2o$49bo3b3o5$39bo$
      17b3o19b3o$17bo2bo21bo$17bo23b2o$17bo10bo$18bobo7b3o$31bo$30b2o$43bo3b
      o$42b5obo$41b3o4b2o$41b2ob5o$43b3o2$45bo$41bo2b3o$40b2obo3bo7b2o$34b2o
      3b2ob3obo2b2o4bobo$34b2o3b3ob2o4b2o6bo$39b3o15b2o4$41bo$41bob3o$42bo3b
      o$13b2o3b2o8bo17bo$12bo2bobo2bo7bo2b2o10b2obo4b2o$11bo9bo5bo5bo11bo5bo
      bo$10b2o9b2o5bobo2b2o18bo$11bo9bo6bo3b2o3bo15b2o$12bo2bobo2bo9b3o4b3o
      7b2o$13b2o3b2o20bo6bo$30b3o4b3o8b3o$28bo3b2o3bo12bo$12b2o14bobo2b2o$
      12b2o13bo5bo$28bo2b2o$28bo!`, 108, 710);

  all = join(all, LWSSPacketGun, P(`
      b2o$b2o$7b3o$6bo3bo$6b2ob2o2$6b2ob2o$8bo4$bo7bo$o2bo3bo2bo$4bobo$4bobo
      $4bobo$o2bo3bo2bo$b3o3b3o8$3b2ob2o$4bobo$4bobo$5bo!`, 18, 725)); // P46Osc really

  const P46OscAlt1 = P(`
      b2o$b2o2$6bo3b2o$2o2b2obob3o13b2o$2o2bo4b3o13b2o$4bo3bo$5b3o$19b2o3b2o
      $5b3o10b3o3b3o$4bo3bo7b3o7b3o$2o2bo4b3o4b3o7b3o$2o2b2obob3o4b3o7b3o$6b
      o3b2o6b3o3b3o$19b2o3b2o$b2o$b2o!`);

  all = join(all, P46OscAlt1.at(4, 24), P46OscAlt1.gen(12).at(224, 67, swap_xy_flip));

  const P46OscAlt2 = P(`
      2o8b3o14b2o$2o8bo3bo12b2o$10bo4bo$11bo3bo2$11bo3bo7b3o$10bo4bo5b2obob
      2o$2o8bo3bo5bo5b2o$2o8b3o8b2obob2o$23b3o!`);

  all = join(all, P46OscAlt2.at(179, 19), P46OscAlt1.gen(29).at(2023, 4, rcw));

  // got impatient here, started throwing in placeholders instead of true definitions --
  // NE corner along E edge:
  all = join(all, P(`
      b2o$b2o2$8b2o9b2o3b2o$2o5bobo8bob2ob2obo$2o4b2obo8bo7bo$7b2o9bob2ob2ob
      o$8bo10b2o3b2o2$8bo$7b2o$2o4b2obo15b2o$2o5bobo15b2o$8b2o2$b2o$b2o!
      `, 1980, 208), P(`
      2b2o5b2o$2b2o5b2o15$b3o5b3o$2ob2o3b2ob2o$2obobobobob2o$bo3bobo3bo$bo2b
      o3bo2bo$2b3o3b3o6$9b2o$9b2o!`, 2018, 179)); // both P46OscAlt really

  // SE corner:
  all = join(all, P(`
      24b2o$24b2o$14bo$13bo2bo$12b5o8b2o$11b2ob3o8b2o$12bob2o$13b2o2$13b2o$
      12bob2o$2o9b2ob3o8b2o$2o10b5o8b2o$13bo2bo$14bo$24b2o$24b2o!
      `, 2017, 2007)); // P46OscAlt really

  // SE corner along S edge:
  all = join(all, P(`
      4b2o5b2o$2o2b2o5b2o2b2o$2o13b2o10$4bo7bo$3bobo5bobo$6bo3bo$3bo2bo3bo2b
      o$4bobo3bobo$6b2ob2o$3b2ob2ob2ob2o$3b2o2bobo2b2o$4b3o3b3o$5bo5bo4$4b2o
      $4b2o!`, 1823, 1980), P(`
      20bo$15bo3bo$14bo8b2o2b2o$14bo2b2o5bo2b2o$15b2o5bobo$16b3o3b2o2$16b3o
      3b2o$15b2o5bobo$2o12bo2b2o5bo2b2o$2o12bo8b2o2b2o$15bo3bo$20bo!
      `, 1840, 2018)); // both P46OscAlt really

  // SW corner:
  all = join(all, P(`
      4b2o4b3o$4b2o3bo3bo$9b2ob2o$10bobo2$10bobo$9b2ob2o$9bo3bo$10b3o9$3b3o
      5b3o$3bo2b2ob2o2bo$4b3o3b3o$5bo5bo4$2o13b2o$2o2b2o5b2o2b2o$4b2o5b2o!
      `, 24, 2017)); // P46OscAlt really

  // SW corner along W edge:
  all = join(all, P(`
      24b2o$24b2o3$2o14b2o7b2o$2o15b2o6b2o$13b5o$13b4o2$3b2o8b4o$2bobob2o5b
      5o$b2o3b2o9b2o6b2o$2bobob2o8b2o7b2o$3b2o2$24b2o$24b2o!
      `, 41, 1769), P(`
      b2o5bo$b2o4bobo$6bo3bo$6bo3bo$5b3ob3o$6bo3bo$6b2ob2o$7bobo$8bo5$3bo3bo
      $3bo3bo3$2obo3bob2o$b3o3b3o$2bo5bo8$b2o5b2o$b2o5b2o!
      `, 6, 1786)); // both P46OscAlt really

  // LWSS -> G -> LWSS timing adjustment, middle of W edge:
  all = join(all, P(`
      b2o5b2o$b2o5b2o16$3o5b3o$o2b2ob2o2bo$b3o3b3o$2bo5bo7$b2o$b2o!
      `, 10, 1217), P(`
      4bo$2b5o10bo$bo2bob2o9b2o8b2o$o7bo9b2o7b2o$bo2bob2o5b2o2b2o$2b5o$4bo2$
      13b2o2b2o$2o16b2o7b2o$2o15b2o8b2o$17bo!
      `, 35, 1269)); // both P46OscAlt really

  // final LWSS reflector, middle of W edge:
  all = join(all, P(`
      15bo$14b2o$13b3obo9b2o$12b2o13b2o$3bo9b2o$b3o10bo$o$b3o10bo10bo$3bo9b
      2o8b2obo$12b2o8b2ob3o$13b3obo5bo2bo$14b2o8b2o$15bo!
      `, 8, 973)); // P46Osc really

  // slide 25: decode --------------------

  // sync buffer:
  all = join(all, P(`
      b2o5b2o$b2o5b2o7$2bo5bo$b3o3b3o$o2b2ob2o2bo$3o5b3o9$b3o$o3bo$2ob2o$bob
      o2$bobo$2ob2o$o3bo3b2o$b3o4b2o!`, 150, 958)); // P46OscAlt3 really

  all = join(all, P(`
      10b2o$2o6b2ob2o14b2o$2o6bo2bo15b2o$8bo2bo$9b2o2$9b2o$8bo2bo$8bo2bo15b
      2o$8b2ob2o14b2o$10b2o!`, 155, 998)); // P46OscAlt3 really

  all = join(all, P(`
      15bobo2b2o$2o12bo3bob3o4b2o$2o13bo6b2o3b2o$16b5obo$19b3o2$19b3o$16b5ob
      o$2o13bo6b2o$2o12bo3bob3o$15bobo2b2o!`, 114, 1008)); // P46OscAlt3 really

  all = join(all, P(`
      b2o$b2o11$2bo5bo$bobo3bobo$o3bobo3bo$o3bobo3bo$o9bo2$b2o5b2o3$3b2ob2o$
      4bobo$3b2ob2o$4bobo$3b2ob2o$4bobo$4bobo$5bo!`, 141, 1024)); // P46OscAlt3 really

  // P46 to P40 converter:
  all = join(all, P(`
      14bo$14b3o$17bo$16b2o50bo$10b2o54b3o$11bo53bo$11bobo51b2o$12b2o57b2o$
      48b2o21bo$48bo20bobo$33bo12bobo20b2o$33b3o10b2o$36bo$35b2o2$6b2o$7bo
      22bo$7bobo19b2o$8b2o10bo4bo49b2o$19b2o3b2o30bo18bo$18b2o3b2o29b4o15bob
      o$19b2o4bo27b2o3b2o13b2o$20b2o34bo3bo$56bo3bo$56bo2b2o$54bo3bo2$33b2o$
      33bo$34b3o$36bo11b2o$22b2o25bo$22bo23b3o$19bo3b3o20bo$17b3o5bo33b2o$
      16bo43bo$16b2o39b3o8bo$30bo26bo8b3o$28b3o34bo$27bo37b2o$27b2o42b2o$48b
      2o21bo$17b2ob2o26bo20bobo$17b2ob2o11bo12bobo20b2o$33b3o10b2o$24b2o10bo
      $24b2o9b2o21b2o$58b2o$16b2o$2b2o11b2obo15bo$bobo12bob4o13bo$bo15bo2b3o
      10b3o39b2o$2o16bo3bo52bo$18b4o51bobo$20bo8b3o34b2o5b2o$31bo21b3o7bo2b
      3o$17b2o11bo21b2ob2o2b4o2bo2bo$17b2o15b2o15bo4b2ob4ob2o2bo$34b2o16b6o
      6b2obo$53b2o2bo8bo$6b2o49b2obo$5bobo50bobo$5bo52bo$4b2o42b2o$10b2o37bo
      $11bo34b3o$8b3o35bo$8bo50b2o$60bo$57b3o$8bo48bo$6bobo$7bobo$7bo2$19b2o
      $19b2o4$2b2o13b2o$3bo11bo2bo$3bobo9bo2bo$4b2o8b2ob2o$13b2ob2o$12b2o3b
      2o$13b3o2bo$18bo$15bobo15b2o$16bo16bobo$35bo$35b2o$29b2o$29bo$30b3o$
      32bo$18b2o$18bo$14bo4b3o$14b3o4bo$17bo$16b2o50bo$10b2o54b3o$11bo53bo$
      11bobo51b2o$12b2o57b2o$48b2o21bo$48bo20bobo$23b2o8bo12bobo20b2o$23b2o
      8b3o10b2o$36bo$35b2o21b2o$58b2o$6b2o16bo$7bo15b3o$7bobo8bo3bo$8b2o7b3o
      bob2o8bo41b2o$16bo3b2obo8bobo19bo20bo$18b4o2bo7bo2bo17bobo3bobo4bo6bob
      o$12b5o2bo4bo5bo4bo16bo3b3obobo2bobo5b2o$12bo2b3o4bo2bo3bo5bo15b2o2bo
      4bobobo3b2o$12b2o9b2o5bo3bo15b2ob3o5bo3b2o$31b2o16bo4bo$50b4o6b2o4bo2b
      o$51b2o6bo6bobo$33b2o24b3o4b2o$33bo24b2o$34b3o21bo$36bo11b2o$14bo7b2o
      25bo$14b3o5bo23b3o$17bo5b3o20bo$16b2o7bo33b2o7bo$10b2o48bo5b3o$11bo45b
      3o5bo$11bobo43bo7b2o$12b2o57b2o$48b2o21bo$18b2o28bo20bobo$18b2o13bo12b
      obo20b2o$33b3o10b2o$20bo15bo26b2o$14b3o3b2ob2o10b2o26b2o$14b2o5bobobo
      32bo$6b2o8bo4bob2o31b2obo$7bo12b3o37bo5b2o$7bobo6b2o2bobo33b2o2bo5b2o$
      8b2o6b6o37bob2o12b2o$16b3o4b2o32bobob2o3b2o7bo$23b2o34bo2bo3b2o5bobo$
      57bob2o12b2o$59bob2o$60b2o4$33b2o$33bo$34b3o$36bo11b2o$14bo7b2o25bo$
      14b3o5bo23b3o$17bo5b3o20bo$16b2o7bo33b2o7bo$10b2o48bo5b3o$11bo45b3o5bo
      $11bobo43bo7b2o$12b2o57b2o$48b2o21bo$48bo20bobo$33bo12bobo20b2o$33b3o
      10b2o$36bo$35b2o2$6b2o$7bo10b3o8b2o$7bobo7bo2bo4bo3b2o$8b2o6bo3bo3bobo
      48b2o$16bo7bobo25bo22bo$19bo32b2o19bobo$16b2obo37bo4bo10b2o$57b2o3b2o$
      58b2o3b2o$19bob2o34bo4b2o$19b3o39b2o$20bo$33b2o$33bo$34b3o$36bo11b2o$
      22b2o25bo$22bo23b3o$19bo3b3o20bo$17b3o5bo33b2o$16bo43bo$16b2o39b3o8bo$
      30bo26bo8b3o$28b3o34bo$27bo37b2o$27b2o42b2o$48b2o21bo$17b2ob2o26bo20bo
      bo$17b2ob2o11bo12bobo20b2o$33b3o10b2o$16b2o6b2o10bo$14bo3bo5b2o9b2o21b
      2o$13bo4b2o38b2o$13bo5bo$2b2o$bobo10bo4bo$bo12b2obob2obo34b3o15b2o$2o
      30bo2b3o19b4o14bo$31bo3bobo14b2o3b2ob2o3b2o6bobo$32bob3o14bo7bo5b3o5b
      2o$49bo2bo5b3o3bob3o$49bo2bo5b2obo2b2obo$34b2o12bo3bo8b2ob2obo$34b2o
      13b3o7bobo3bobo$60bo4bo2bo$6b2o57b3o$5bobo50b2o6bo$5bo52b2o$4b2o42b2o$
      10b2o37bo$11bo34b3o$8b3o35bo$8bo50b2o$60bo$57b3o$8bo48bo$6bobo$7bobo$
      7bo2$19b2o$19b2o4$2b2o$3bo$3bobo$4b2o4b4o$9b2o2bo5b2o$8b2o2bo4bobob2o$
      9bo2bo2b2o5bo$10b2o6bo3bo$15bo5bo11b2o$16b4o13bobo$18bo16bo$35b2o$29b
      2o$29bo$30b3o$32bo$18b2o$18bo$19b3o$21bo!`, 116, 1059)); // really 14 p184 guns

  // logic core latches:
  all = join(all, P(`
      24bo2bo$14b3o7bo$13bo4bo9bo$12bo5bo8b2o$3bo9bo8bo$b3o10b2o8b2o$o$b3o
      10b2o8b2o$3bo9bo8bo3bo$12bo5bo4bo2bo$13bo4bo4bo2bo$14b3o7b2o!
      `, 33, 1332)); // P46Osc really

  all = join(all, P(`
      4b2o5b2o$2o2b2o5b2o2b2o$2o13b2o2$4b3o3b3o$4bo2bobo2bo$3bo3bobo3bo$4bo
      2bobo2bo$6bo3bo$4b2o5b2o$3b3o5b3o$3b3o5b3o5$10b3o$10b3o$9b5o$8b2o3b2o$
      8b2o3b2o4$8b2o3b2o$4b2o2b2o3b2o$4b2o3b5o$10b3o$10b3o!`, 35, 1348)); // P46OscAlt1 really

  all = join(all, P(`
      b2o$b2o2$13bobo2b2o$2o10bo3bob3o$2o11bo6b2o$14b5obo$17b3o2$17b3o$14b5o
      bo$2o11bo6b2o3b2o$2o10bo3bob3o4b2o$13bobo2b2o2$b2o$b2o!
      `, 24, 1661)); // P46OscAlt1 really

  all = join(all, P(`
      b2o$b2o12$b3o3b3o$b3o3b3o$ob2o3b2obo$ob2o3b2obo$b2o5b2o$2bo5bo3$3b2ob
      2o$4bobo$4bobo$4bobo$3b2ob2o$4bobo$4bobo$5bo!`, 49, 1679)); // P46Osc really

  all = join(all, P(`
      b2o$o2bo$o7bo$o2bo3bobo$2ob2ob2ob2o$4bobo$3b2ob2o5$b3o3b3o$o9bo$o3bobo
      3bo$b3o3b3o$2bo5bo10$3b2ob2o$4bobo$4bobo$5bo!`, 140, 1546)); // P46Osc really

  all = join(all, P(`
      2b3o$2b3o4b2o$bo3bo3b2o$o5bo$b2ob2o2$b2ob2o$o5bo$bo3bo$2b3o$2b3o7$b2o
      7b2o$bob2o3b2obo$bo3bobo3bo$b2o2bobo2b2o$2b3o3b3o$3bo5bo6$2b2o5b2o$2b
      2o5b2o!`, 184, 1538)); // P46OscAlt3 really

  all = join(all, P("2o$o$b3o$3bo!", 159, 1537)); // eater really

  // slide 26: read B/S table --------------------
  // most of the B/S logic latches -- missing some reflectors off to the left (?)
  // TODO: take this apart and integrate with missing pieces

  all = join(all, P(`
      34bo$33bobo$33bobo$32b2ob2o11$30bo7bo22b2o5b2o$29bobo5bobo21b2o5b2o$
      32bo3bo$29bo2bo3bo2bo$30bobo3bobo$32b2ob2o$29b2ob2ob2ob2o$29b2o2bobo2b
      2o$30b3o3b3o$31bo5bo23b3o3b3o$60bo2bo3bo2bo$60b2obo3bob2o2$37b2o$37b2o
      6$62bo$60b2ob2o$60b2ob2o15b2o5b2o$80b2o5b2o$59bobobobo2$60b2ob2o$61b3o
      4b2o$62bo5b2o4$81bo5bo$80b3o3b3o$80bob2ob2obo$82b2ob2o$82b2ob2o$82b2ob
      2o6$80b3o$80b3o2$79b2ob2o$79bo3bo$80b3o$81bo5b2o$87b2o199$51bo$50bobo$
      50bobo$49b2ob2o13$47bo7bo$46b4o3b4o$46bo3bobo3bo$47bo2bobo2bo$47b3o3b
      3o7$47b2o$47b2o9$62b3ob3o9b2o$61bob2ob2obo7b2ob2o6b2o$60b2o7b2o7bo2bo
      6b2o$61bob2ob2obo8bo2bo$62b3ob3o10b2o2$79b2o$78bo2bo$61b2o15bo2bo6b2o$
      61b2o14b2ob2o6b2o$78b2o5$80b2o5b2o$80b2o5b2o11$81bo5bo$80bobo3bobo$79b
      o3bobo3bo$79bo3bobo3bo$79bo9bo2$80b2o5b2o4$82bo3bo$80b2o$79bo3bobo3b2o
      $79bo3bobo$80b3o$87bo2bo$87b2o12$8b2o$8b2o13$b2o5b2o$o2bo3bo2bo$bo2bob
      o2bo$4bobo$2b3ob3o$3o5b3o$2o7b2o$2o7b2o$bob2ob2obo$bob2ob2obo2$3b2ob2o
      $4bobo$4bobo$5bo26$9bo$8bobo$8bobo$7b2ob2o11$5b2o5b2o$4bo2bo3bo2bo$7b
      2ob2o$6bobobobo$6bobobobo$4bo9bo$3bo11bo2$7b2ob2o$5bo2bobo2bo$5b3o3b3o
      3$5b2o$5b2o38$10bo$9bobo28bo$9bobo21b2o4bobo$8b2ob2o20bo5bobo$31bobo4b
      2ob2o$18b2o11b2o$19bo18b2ob2o$19bobo$20b2o16b2ob2o3$23b2o$22bobo11bo7b
      o$24bo$6b2o5b2o19b3o7b3o$5bo2bo3bo2bo19b2ob2ob2ob2o$6bo2bobo2bo15b2o4b
      3o3b3o$9bobo18bobo4bo5bo$7b3ob3o16bo$5b3o5b3o$5b2o7b2o$5b2o7b2o$6bob2o
      b2obo$6b3o3b3o$7bo5bo$9b3o3b3o$8bo2bo3bo2bo$12bobo$8b2o7b2o$8b2o7b2o$
      11bo3bo$11b2ob2o$9b3o3b3o$9b2o5b2o16bo5bo$9bo7bo15bobo3bobo$32bo3bobo
      3bo$32bo3bobo3bo$32bo9bo2$33b2o5b2o3$35b2ob2o$36bobo$35b2ob2o$11b2ob2o
      20bobo$12bobo20b2ob2o$12bobo21bobo$13bo22bobo$37bo3$52b2o$51b5o$35b2o
      14bo4bo5b2o$35b2o14b3o2bo5b2o$52bo2b2o$53b2o$37bo3bo$35b2obobob2o9b2o$
      34bob2o3b2obo7bo2b2o$33bo2bo5bo2bo5b3o2bo5b2o$34bob2o3b2obo6bo4bo5b2o$
      35b2obobob2o7b5o$37bo3bo10b2o8$19b2o$18bo2bo$18bobo2bo$19bo$20b2obo$
      22bo3$21b2o$21b2o4b3o$27b3o$26bo3bo$26b2ob2o$26bo3bo$27bobo$27bobo$28b
      o5$23b2ob2o$22bo5bo2$21bo7bo$21bo2bobo2bo$21b3o3b3o9$21b2o5b2o$21b2o5b
      2o23$9bo2bo$12bo7b3o$8bo9bo4bo$8b2o8bo5bo35bo$14bo8bo36b2o$11b2o8b2o
      24b2o9bob3o$47b2o13b2o$11b2o8b2o38b2o$14bo8bo37bo$8b2o8bo5bo10b2o$8bo
      9bo4bo11b2o24bo$12bo7b3o38b2o$9bo2bo34b2o13b2o10b2o$47b2o9bob3o11b2o$
      60b2o$60bo!`, 108, 1317));

  // slide 27: boat logic --------------------

  all = join(all, P(`
      32b4o$31b2o2bo$30b2o2bo$26bo4bo2bo25b2o$24b3o5b2o25b2ob2o$23bo36bo2bo$
      24b3o5b2o26bo2bo4bo$26bo4bo2bo26b2o5b3o$30b2o2bo36bo$31b2o2bo25b2o5b3o
      $32b4o7bo16bo2bo4bo$41b2o17bo2bo$42b2o15b2ob2o$60b2o3$b2o$b2o2$14b4o$
      2o12bo2b2o$2o13bo2b2o$15bo2bo$16b2o2$16b2o15b2ob2o$15bo2bo12bobo3bo$2o
      13bo2b2o5b2o3bobo3bo$2o12bo2b2o6b2o3bo4bo$14b4o11b2o5b3o$38bo$b2o$b2o!
      `, 209, 1852)); // P46Osc plus P46Gun plus custom eater really

  // boat-logic:  need to add outlying pieces to west, break up into 12
  all = join(all, P(`
      119bo$35b2o81b2ob2o$34b5o11b2o54b2o10b2o2bo3b2o217b2o$34bo4bo11bo53bo
      2bo11bob2o3bo217bo7b3o5b4o$34b3o2bo10bo49bo4bo2b2o9bo2bo3bo219bo6bo7b
      2obo$21bo13bo2b2o11b3o43bo3bo3bo2bo11b2o5b3o213b3o7b2obo7bo10bo$19b3o
      14b2o15bo41b7o5bo12bo8bo213bo11b2o5b2o11b3o$18bo75bo283bo$19b3o14b2o
      57b7o5bo247b2o5b2o11b3o$21bo13bo2b2o57bo3bo3bo2bo246b2o7bo10bo$34b3o2b
      o60bo4bo2b2o251b2obo$34bo4bo65bo2bo252b4o$34b5o4b2obo59b2o11b2obo227bo
      $35b2o6b2ob3o70b2ob3o223b6o$49bo75bo221bo4bo$43b2ob3o70b2ob3o223b3ob2o
      $41bo2bobo70bo2bobo227bobo2bo$41b2o74b2o235b2o11$53bo37b2o$48bo3bo28b
      2o7bobo187bo3bo$47bo7bo25b2o6b2obo186bo5bo$47bo2b2o5bo32b2o14bo107bobo
      2b2o58bo$36bo11b2o5b2obo32bo14b3o90b2o12bo3bob3o4b2o43bo7b2o3bo8bo$34b
      3o12b3o3b2ob3o48bo89b2o13bo6b2o3b2o41b3o9b3o9b3o$33bo27bo29bo14b3o106b
      5obo46bo27bo$34b3o12b3o3b2ob3o29b2o14bo111b3o48b3o9b3o9b3o$36bo11b2o5b
      2obo30b2obo17bo88bobo3bobo63bo7b2o3bo8bo$47bo2b2o5bo32bobo17b3o88bo3bo
      12b3o58bo$47bo7bo35b2o20bo83bo11bo5b5obo57bo5bo$48bo3bo59b2o82bo3bo5bo
      3bo3bo6b2o3b2o52bo3bo$53bo143bo11bo3bo3bob3o4b2o$201bo3bo8bobo2b2o$
      199bobo3bobo12$2b2o5b2o$2b2o5b2o$59bo229bob2o$58b2o228bo2b2o2b3o$57b2o
      229bo6b2o$51bo6b2o2b2o9bo101b2o109b4o3b3o12bo$49b3o21b3o99bo108b3o3bo
      3bo13b3o$48bo27bo99b3o70bo33bo27bo$49b3o21b3o102bo70b3o32b3o3bo3bo13b
      3o$51bo6b2o2b2o9bo178bo33b4o3b3o12bo$57b2o192b2o35bo6b2o$58b2o228bo2b
      2o2b3o$59bo229bob2o$2b3o3b3o$2b3o3b3o$bob2o3b2obo$bob2o3b2obo$2b2o5b2o
      $3bo5bo4$4b2ob2o$3bo5bo$b5ob2ob2o$2ob3ob2ob2o$3o6bo$bobo$2b2o263b4o5b
      6o$212b6o5b4o40bob2o7b4o$212b4o7b2obo40bo7bob2o$76b2o46b2o89b2obo7bo
      41b2o5b2o$75bo2bo44bo2bo90b2o5b2o$76b2o46b2o142b2o5b2o$217b2o5b2o41bo
      7bob2o$215b2obo7bo26b2o12bob2o7b4o$212b4o7b2obo12b2o12b2o12b4o5b6o$
      212b6o5b4o12b2o!`, 679, 1875)); // P46Osc1-4 boat logic

  // mystery stuff along bottom edge that needs a home in a slide:

  all = join(all, P(`
      b2o5b2o$b2o5b2o14$3o5b3o$3o5b3o$b2o5b2o$3bo3bo$bo2bobo2bo$o3bobo3bo$bo
      2bobo2bo$b3o3b3o5$8b2o$8b2o!`, 514, 1887)); // P46OscAlt3 really

  all = join(all, P(`
      4bo7b2o$3b2o6bo2bo$2bo8bo2b2o$3b2obo4bo2bo10bo$4b3o6bo11b3o$28bo$4b3o
      6bo11b3o$bob2obo4bo2bo10bo$o10bo2b2o$o3bo6bo2bo$b4o7b2o!
      `, 791, 1929)); // P46Osc really

  all = join(all, P(`
      8bo$9bo3bo$2o2b2o8bo$2o2bo5b2o2bo$4bobo5b2o11bo$5b2o3b3o12b3o$28bo$5b
      2o3b3o12b3o$4bobo5b2o11bo$4bo5b2o2bo$4b2o8bo$9bo3bo$8bo!
      `, 845, 1905)); // P46Osc really

  all = join(all, P(`
      10b2o$2o6b2ob2o14b2o$2o6bo2bo15b2o$8bo2bo$9b2o2$9b2o10b3ob3o$8bo2bo8bo
      b2ob2obo$2o6bo2bo7b2o7b2o$2o6b2ob2o7bob2ob2obo$10b2o9b3ob3o!
      `, 1050, 1903)); // P46OscAlt2 really

  all = join(all, P(`
      9b2o$9b2o11$2b3o3b3o$bo3bobo3bo$o3b2ob2o3bo$ob2o5b2obo$2bo7bo11$2b2o5b
      2o$2b2o5b2o!`, 1088, 1920)); // P46OscAlt2 really

  all = join(all, P(`
      11bo$10b4o9bo$2b2o4b2o3bo9bo2b2o$2bo5b2o12bo5bo$3bo4b3o12bobo2b2o$3o
      20bo3b2o3bo$o24b3o4b3o$35bo$25b3o4b3o$23bo3b2o3bo$23bobo2b2o$22bo5bo$
      7bob2o12bo2b2o$5b3ob2o12bo$4bo$5b3ob2o$7bobo2bo$11b2o!
      `, 1106, 1875)); // P46OscAlt4 (boat-bit catcher?) really [not defined yet]

  all = join(all, P(`
      25bobo$26bo$17b2o13b2o$16b2ob2o12bo$17bo2bo11bo$3bo13bo2bo4b2o6b3o$b3o
      14b2o15bo$o$b3o14b2o$3bo13bo2bo$17bo2bo$16b2ob2o$17b2o6b2obo$25b2ob3o$
      31bo$25b2ob3o$23bo2bobo$23b2o!`, 1227, 1875)); // P46OscAlt4 really

  all = join(all, P("2o$obo$2bo$2b2o!", 1281, 1873)); // eater

  all = join(all, P(`
      4b2o5b2o$2o2b2o5b2o2b2o$2o13b2o4$4b3o3b3o$4bo2bobo2bo$3bo3bobo3bo$3b4o
      3b4o$4bo7bo7$5bo$4b3o$3bo3bo$3b2ob2o$3b2ob2o2$3b2ob2o$3b2ob2o$3bo3bo3b
      2o$4b3o4b2o$5bo!`, 1375, 1980)); // P46OscAlt1 really

  // slide 28: clean up and start over --------------------
  const LWSSToGlider = P(`
      4b2o5b2o$2obobo5bobob2o$2ob2o7b2ob2o$2b6ob6o$4bob2ob2obo2$2bo11bo$3bo
      9bo$5bobobobo$5bobobobo$6b2ob2o$3bo2bo3bo2bo$4b2o5b2o13$4b2o$4b2o!
      `, 443, 1980);

  // slide 29: toggle dist [not sure what that means, actually] --------------------
  const BoatLatchNE = P(`
      78b2o5b2o$78b2o5b2o15$77b2o7b2o$77bob2o3b2obo$77bo3bobo3bo$46b2o5b2o
      22b2o2bobo2b2o$46b2o5b2o23b3o3b3o$79bo5bo4$47bo5bo$46b3o3b3o$45bo2b2ob
      2o2bo22b2o$45bo3bobo3bo22b2o$47bobobobo2$44b2ob2o3b2ob2o$46bo7bo5$47bo
      $46b3o$45bo3bo$44bo5bo$44bo5bo$45bo3bo2$45bo3bo$44bo5bo$44bo5bo2b2o$
      45bo3bo3b2o$46b3o$47bo7$45b2o$45bo$46b3o$48bo20$13b2o$15bo$2o10b2o2bo
      10b2o$2o11bo2bo10b2o$14bobo$14b2o2$14b2o$14bobo$2o11bo2bo$2o10b2o2bo$
      15bo$13b2o12$47b4o$46b2o2bo14b2o$45b2o2bo15b2o$46bo2bo$47b2o2$47b2o$
      46bo2bo$38b2o5b2o2bo15b2o$38b2o6b2o2bo14b2o$47b4o!`, 120, 232); // four P46osc really

  const BoatLatchSW = P(`
      76bo$75bo2bo$74b5o10b2o$73b2ob3o10b2o$74bob2o$75b2o72b2o5b2o$145b2o3bo
      5bo3b2o$75b2o68bo15bo$74bob2o68bo13bo$62b2o9b2ob3o10b2o$62b2o10b5o10b
      2o$75bo2bo$76bo2$149b2o5b2o$149b2obobob2o$73b2o74bo2bobo2bo$73b2o74b3o
      3b3o2$82b2o$72b2o7bo2b2o11b2o$57b2o5b2o6b2o6b6o11b2o$53b2o2b2o5b2o2b2o
      12b4o77b2o89bo$53b2o13b2o93b2o84bo3bo$173bo60b2o12bo8b2o2b2o$173b2o59b
      2o12bo2b2o5bo2b2o$6bo75b4o76b2o7bob3o11b2o60b2o5bobo$5bobo64b2o6b6o76b
      2o11b2o10b2o61b3o3b2o$5bobo64b2o7bo2b2o88b2o$4b2ob2o73b2o90bo75b3o3b2o
      $156b2o64b2o25b2o5bobo$57b3o3b3o7b2o81b2o16bo48bo24bo2b2o5bo2b2o$56bo
      3bobo3bo6b2o99b2o47bobo22bo8b2o2b2o$55bo3b2ob2o3bo94b2o11b2o47b2o23bo
      3bo$55bob2o5b2obo94b2o7bob3o78bo$57bo7bo107b2o$173bo$163b2o$163b2o3$
      57b3o$b3o5b3o45bobo$2ob2o3b2ob2o43bo3bo$2obobobobob2o43bo3bo$bo3bobo3b
      o$bo2bo3bo2bo45b3o4b2o$2b3o3b3o53b2o6$2b2o$2b2o37$27b2o90b2o$27b2o81b
      2o7b2o79b2o$110b2o88b2o$47b3o53b3o25bobo2b2o$26b2o6b3o8b2obob2o50bo3bo
      11b2o10bo3bob3o$26b2o6bo3bo5bo5b2o50b2ob2o11b2o11bo6b2o54bo5bo$34bo4bo
      5b2obob2o80b5obo54b3o3b3o$35bo3bo7b3o52b2ob2o28b3o55bob2ob2obo$104bo
      87b2o7b2o$35bo3bo95b3o54b2o7b2o$34bo4bo92b5obo53b3o5b3o$26b2o6bo3bo12b
      2o65b2o11bo6b2o3b2o49b3ob3o$26b2o6b3o14b2o50bo7bo6b2o10bo3bob3o4b2o51b
      obo$102bo2bo3bo2bo18bobo2b2o55bo2bobo2bo$106bobo83bo2bo3bo2bo$27b2o77b
      obo10b2o72b2o5b2o$27b2o77bobo10b2o$102bo2bo3bo2bo$103b3o3b3o7$99b2o13b
      2o73b2o13b2o$99b2o2b2o5b2o2b2o73b2o2b2o5b2o2b2o$103b2o5b2o81b2o5b2o!
      `, 1534, 1849); // really eleven P45OscAlt1 plus an eater

  all = join(all, BoatLatchNE, BoatLatchSW, P(`
      273b2o$272bo2bo$140b2o130bobobo10b2o2bobo$140b2o131bo2bo3b2o4b3obo3bo
      12b2o$277bo2b2o3b2o6bo13b2o$274bobo9bob5o$287b3o2$287b3o$286bob5o$285b
      2o6bo13b2o$286b3obo3bo12b2o$287b2o2bobo3$175b2o$140b3o3b3o22bobo2bo$
      140bo2bobo2bo20b3ob2o79b2o$140b2obobob2o19bo84bo2bo$140b2o5b2o20b4o80b
      o7bo$171bob2o13bo64bo2bo3bobo$188b2o63b2ob2ob2ob2o$189b2o66bobo$184b2o
      2b2o6bo42b2o15b2ob2o$142b2ob2o28bobo18b3o40b2o$140bo2bobo2bo26bobo21bo
      3bo$140bobo3bobo15bo10b2o19b3o4b3o5b2o11b4o$140b3o3b3o15b3o9bo7b2o2b2o
      6bo9bo4bo3b2o6b2o2bo12b2o$140b2o5b2o18bo5b2obobo10b2o14bo3bobo3b2o5b2o
      2bo13b2o12b3o3b3o$140b2o5b2o17bo11bo9b2o14bo3bobo12bo2bo26bo9bo$140b2o
      5b2o17b2o6bo2bo10bo15b2ob2o15b2o27bo3bobo3bo$176b2o76b3o3b3o$224b2o29b
      o5bo$223bo2bo$222b2o2bo13b2o$223b2o2bo12b2o$224b4o2$11b2o226b2o$10bobo
      226b2o$10bo30b2o$9b2o30b2o226b2o5b2o$33b2o4bo13bo3b3o55b2o63b2o74b2ob
      2o4b2obobo5bobob2o$33bo3b3o12bobo2b5o53bo7b3o5b4o35b2o6b2ob2o15b2o57bo
      bo5b2ob2o7b2ob2o$34bo3bobo11bo3b2o58bo6bo7b2obo35b2o6bo2bo17b2o34b2o5b
      2o13bobo7b6ob6o$31b3o5b2o12bo2bo3b2obo49b3o7b2obo7bo10bo32bo2bo16bo7b
      4o21b2o2b2o5b2o2b2o10bo10bob2ob2obo$31bo22b3o3b2ob3o47bo11b2o5b2o11b3o
      31b2o25bo2b2o20b2o13b2o$66bo81bo58bo2b2o55bo11bo$54b3o3b2ob3o59b2o5b2o
      11b3o31b2o26bo2bo4bo52bo9bo$53bo2bo3b2obo61b2o7bo10bo32bo2bo26b2o5b3o
      52bobobobo$52bo3b2o73b2obo35b2o6bo2bo36bo51bobobobo$52bobo2b5o69b4o35b
      2o6b2ob2o25b2o5b3o53b2ob2o$38bob2o11bo3b3o60bo59b2o25bo2bo4bo52bo2bo3b
      o2bo$36b3ob2o76b6o83bo2b2o23bo7bo25b2o5b2o$35bo81bo4bo83bo2b2o$36b3ob
      2o76b3ob2o82b4o23b3o7b3o$38bobo2bo76bobo2bo108b2ob2ob2ob2o$42b2o80b2o
      109b3o3b3o$236bo5bo2$114bo$10b2o9b3ob3o82b2o2bo$8b2ob2o7bob2ob2obo80bo
      5bo$8bo2bo7b2o7b2o78b2o2bobo$3bo4bo2bo8bob2ob2obo80b2o3bo12bo$b3o5b2o
      10b3ob3o82b3o14b3o$o129bo138b2o$b3o5b2o99b3o14b3o107b2ob2o27b2o$3bo4bo
      2bo97b2o3bo12bo110bobo$8bo2bo15b2o73b2o4b2o2bobo123bobo$8b2ob2o14b2o
      73b2o5bo5bo123bo$10b2o98b2o2bo$114bo13$170b2o2b2o4bo2b2o12b2o$170b2ob
      2o6b2obo12b2o$174bobo6bo$175b2o4b3o2$175b2o4b3o$174bobo6bo$170b2ob2o6b
      2obo$170b2o2b2o4bo2b2o!`, 178, 1939)); // really P46Guns and Oscs, etc.

  all = join(all, P(`
      4b2o5b2o$2o2b2o5b2o2b2o$2o13b2o8$5bo5bo$4b3o3b3o$3b2ob2ob2ob2o$2b3o7b
      3o2$4bo7bo5$5bo$4b3o$3bo2bo$3bobobo$4b3o$5bo5b2o$11b2o!
      `, 557, 1931)); // P46OscAlt1 really
  // this particular one reflects a B signal from the above sync-buffer circuitry;
  // the resulting LWSS is converted to a glider which is stored as a boat-bit.

  // a few more outlying LWSS reflectors:
  all = join(all, P(`
      12b3o$10bo4bo11b2o$10bo5bo10b2o$3bobobo7bo$b7o5b2o$o$b7o5b2o$3bobobo7b
      o$10bo5bo$10bo4bo$12b3o!`, 257,1840), P(`
      15b2o$13b2o2bo$13b6o$13b4o4bo3bo$21b7o$28bo$21b7o$13b4o4bo3bo$2o11b6o$
      2o11b2o2bo$15b2o!`, 885, 2033)); // both P46Osc really

  // slide 30: HWSS control --------------------

  const HWSSGun = P(`
      21b2o23b2o$22bo22bobo$22bobo$23b2o$36b4o8bo$36bob2o7b2o$36bo$37b2o2$
      37b2o$36bo$7b2o2bobo22bob2o7b2o$2o4b3obo3bo21b4o8bo$2o3b2o6bo$6bob5o$
      7b3o35bobo$46b2o$7b3o$6bob5o14b2o$2o3b2o6bo8bo5bo$2o4b3obo3bo7bo4bo4b
      2o$7b2o2bobo12b3o3b2o$23bob2ob2o$25bo$22bo2b3o11b2o$2b2o18b2o2b2o9bo4b
      o$2b2o20bo2bo15bo$24b3o10bo5bo$16b2o20b6o$b2o13bobo$b2o13bob2o$17b2o$
      17bo13b2o$30bobo$17bo13bo67b2o$17b2o80b2o$b2o13bob2o29b2o2bo4b2o16b2o
      3b2o8bo$b2o13bobo30bob2o6b2o14bo2bobo2bo7bo2b2o$16b2o20bo11bo6bobo14bo
      9bo5bo5bo3b2o$36b3o11b3o4b2o14b2o9b2o5bobo2b2o2b2o$2b2o31bo38bo9bo6bo
      3b2o$2b2o32b3o11b3o4b2o16bo2bobo2bo9b3o$38bo11bo6bobo16b2o3b2o$24bo24b
      ob2o6b2o32b3o$23b3o23b2o2bo4b2o31bo3b2o$23bob2o35bo12b2o14bobo2b2o2b2o
      $24b3o11b2o22b2o11b2o13bo5bo3b2o$24b3o11bobo20bobo27bo2b2o$20b3ob3o13b
      o50bo$24b3o11b3o5bo52b2o$24b2o20b3o50b2o$2b2o45bo$2b2o19bo22b3o$11bo
      10bo15b3o5bo$7b2o2bo10bo17bo$b2o3bo5bo25bobo$b2o2b2o2bobo12bo13b2o$6b
      2o3bo38b2o$7b3o41b2o$50bo$7b3o$6b2o3bo$b2o2b2o2bobo$b2o3bo5bo48b2o$7b
      2o2bo13b2o34b2o$11bo13bobo$2b2o23bo16b3o3bo$2b2o23b2o13b5o2bobo10b2o$
      41b2o3b2o3bo10b2o$42b2o3bo2bo$43bo3b3o2$43bo3b3o$42b2o3bo2bo$41b2o3b2o
      3bo10b2o$42b5o2bobo10b2o$42bob3o3bo$40b2o$34b2o4b3o18b2o$34b2o3bo3bo
      17b2o$38bo5bo$39b2ob2o2$39b2ob2o$38bo5bo$39bo3bo$40b3o$40b3o7$33b2o7b
      2o$33bob2o3b2obo$33bo3bobo3bo$33b2o2bobo2b2o$34b3o3b3o$35bo5bo6$34b2o
      5b2o$34b2o5b2o3$40bo2bo$30b3o7bo$16b2o11bo4bo9bo$16b2o10bo5bo8b2o$29bo
      8bo$30b2o8b2o2$30b2o8b2o$29bo8bo3bo$16b2o10bo5bo4bo2bo$16b2o11bo4bo4bo
      2bo$30b3o7b2o4$79b2o$78bo2bo$73bo7bo$72bobo3bo2bo$22bo48b2ob2ob2ob2o$
      20b3o52bobo$19bo54b2ob2o$19b2o$33bo$31b3o$14b2o14bo$15bo14b2o40b3o3b3o
      $15b2obo17b2o33bo9bo$18bo17bo34bo3bobo3bo$19b2o13bobo35b3o3b3o$15b3o2b
      2o12b2o37bo5bo$17b2o$15bo2bo4bo$14bobobo3bo$13bo4bo$5b2o6bo2bob3o5bo$
      4bobo7bo3b3ob2o3bo$4bo10b2o5bo4bo$3b2o10b2o3b2o2bobo$15bo4bo$20b3o51b
      2ob2o$16b2o57bobo$75bobo$12b2o2b3o57bo$13bobobo$14b4o$9b2o4bo$8bobo$8b
      o$7b2o7bobo$17b2o$17bo3$7b2o$8bo$8bobo$9b2o2$13bob2o$13bob2o2$22bo$12b
      2o4bob2obo$12b2o2bo5bo$3b2o11bo5bo$4bo7b2o6b2o4b2o$4bobo5b2o4bobo5b2o$
      5b2o11b2o5$34b2o$34bobo$36bo$36b2o$30b2o$30bo$31b3o$33bo$19b2o$19bo$
      20b3o$22bo$34b2o7b2o$32b2o2bo6b2o$32b6o4bo2bo$22bo9b4o5bob2o$20b3o18bo
      b2o$19bo$20b3o18bob2o$22bo9b4o5bob2o14b2o$32b6o4b3ob2o11bo$32b2o2bo6bo
      bobo12b3o$34b2o7b4o15bo$44b2o!`); // TODO: take this apart further

  const LWSSFromTheBlue = P(`
      27b2o5b2o$23b2o2b2o5b2o2b2o$23b2o13b2o2$28bo5bo$27b3o3b3o$26bo2b2ob2o
      2bo$26bo3bobo3bo$28bobobobo2$25b2ob2o3b2ob2o$27bo7bo8$10b2o$8b2ob2o$8b
      o2bo$3bo4bo2bo$b3o5b2o15bo$o21b5o$b3o5b2o10bo2b3o7b2o$3bo4bo2bo10b2o
      10b2o$8bo2bo$8b2ob2o$10b2o$25bo$25bo!`); // P46Osc really

  let RowOfLWSSFTB = P("o$3o$3bo$2b2o!", 1737, 24);
  for (let i = 0; i < 43; i++) {
    RowOfLWSSFTB = join(RowOfLWSSFTB, LWSSFromTheBlue.gen((i*12) % 46).at(40*i, 0));

  }
  const HWSSHalfControl = join(HWSSGun.at(106, 87), RowOfLWSSFTB.at(188, 79));

  let CellCenter = join(HWSSHalfControl, HWSSHalfControl.at(2047, 2047, swap_xy_flip));

  const OFFcell = join(all, CellCenter, StateBit);

  // slide 31: display on --------------------

  // switch on the HWSS guns:
  CellCenter = join(CellCenter, P("2o$2o!", 171, 124), P("2o$2o!", 1922, 1875));

  // now generate the ONcell HWSSs and LWSSs
  // add rest of pattern after the center area is filled in
  // and p184 HWSS guns are in the same phase (3680 = 184 * 40)
  const ONcell = join(all, CellCenter.gen(3680));

  return { off: OFFcell.xy, on: ONcell.xy };
}

let built: { off: number[]; on: number[] } | null = null;

/**
 * The rule table's eaters fixed for a rule (metafier.py's RuleBits): a cell beside each broken eater whose count is in
 * the rule's births, and one in its survivals.
 */
function ruleBits(rule: Rule): number[] {
  const bits = (values: number[]) => {
    let rle = "b10$b10$b26$b10$b10$b26$b10$b10$b!";
    for (const v of values) {
      // because B and S values are highest at the top
      const ind = 32 - v * 4;
      rle = rle.slice(0, ind) + "o" + rle.slice(ind + 1);
    }
    return rle;
  };
  return join(P(bits([...rule.birth]), 148, 1404), P(bits([...rule.survival]), 162, 1406)).xy;
}

/** The OFF and ON metapixels programmed for a rule, each in its own frame (its corner tub at -5, -5). */
export function metapixels(rule: Rule = CONWAY): { off: number[]; on: number[] } {
  built ??= build();
  const bits = ruleBits(rule);
  return { off: built.off.concat(bits), on: built.on.concat(bits) };
}

/**
 * A pattern metafied: a metapixel for each of its cells, ON where it is alive (rows of 1s and 0s, y down), metapixel
 * (i, j) at (2048 i, 2048 j) (Golly's script puts the whole tiling 5 cells up and left of that). Outside the grid there
 * is nothing, which the metapixels on its edge read as dead neighbours.
 */
export function metafy(rows: number[][], rule: Rule = CONWAY): [number, number][] {
  const { off, on } = metapixels(rule);
  const out: [number, number][] = [];
  rows.forEach((row, j) =>
    row.forEach((v, i) => {
      const xy = v ? on : off;
      for (let k = 0; k < xy.length; k += 2) out.push([xy[k] + META_SIZE * i, xy[k + 1] + META_SIZE * j]);
    }),
  );
  return out;
}

/**
 * The same tiling built straight into a HashLife board, its cells never listed (hundreds of metapixels hold tens of
 * millions): each 2048-cell block is the union of the slices of the tiles around it (a tile spills 5 cells into each
 * neighbour), made once for each neighbourhood of ON, OFF and no tile, and the blocks are joined into the quadtree.
 */
export function metafyInto(h: Hashlife, rows: number[][], rule: Rule = CONWAY) {
  // cleared first: every node is then made by this table, with an id of its own; nodes made before a clear would share
  // ids with those made after it, and HashLife's bounds and collection go by id
  h.clear();
  const tiles = metapixels(rule);
  const level = 11;
  // a quadtree node from cells inside one block, block-local
  const build = (cells: [number, number][], l: number, x0: number, y0: number): HNode => {
    if (!cells.length) return h.empty(l);
    if (l === 0) return h.alive;
    const half = 1 << (l - 1);
    const q: [number, number][][] = [[], [], [], []];
    for (const c of cells) q[(c[1] >= y0 + half ? 2 : 0) + (c[0] >= x0 + half ? 1 : 0)].push(c);
    return h.node(build(q[0], l - 1, x0, y0), build(q[1], l - 1, x0 + half, y0), build(q[2], l - 1, x0, y0 + half), build(q[3], l - 1, x0 + half, y0 + half));
  };
  const union = (a: HNode, b: HNode): HNode => (!a.pop ? b : !b.pop ? a : a.level === 0 ? h.alive : h.node(union(a.nw, b.nw), union(a.ne, b.ne), union(a.sw, b.sw), union(a.se, b.se)));
  // slice[state][dy + 1][dx + 1]: the part of a tile lying in the block (dx, dy) from its own
  const slice = [tiles.off, tiles.on].map((xy) => {
    const parts = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => [] as [number, number][]));
    for (let k = 0; k < xy.length; k += 2) {
      const dx = Math.floor(xy[k] / META_SIZE),
        dy = Math.floor(xy[k + 1] / META_SIZE);
      parts[dy + 1][dx + 1].push([xy[k] - META_SIZE * dx, xy[k + 1] - META_SIZE * dy]);
    }
    return parts.map((row) => row.map((cells) => build(cells, level, 0, 0)));
  });
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const state = (i: number, j: number) => (j >= 0 && j < rows.length && i >= 0 && i < (rows[j]?.length ?? 0) ? (rows[j][i] ? 1 : 0) : -1);
  const blocks = new Map<string, HNode>();
  const block = (bi: number, bj: number): HNode => {
    const around: number[] = [];
    for (let tj = bj - 1; tj <= bj + 1; tj++) for (let ti = bi - 1; ti <= bi + 1; ti++) around.push(state(ti, tj));
    const sig = around.join(",");
    let n = blocks.get(sig);
    if (!n) {
      n = h.empty(level);
      for (let tj = bj - 1, k = 0; tj <= bj + 1; tj++) for (let ti = bi - 1; ti <= bi + 1; ti++, k++) if (around[k] >= 0) n = union(n, slice[around[k]][bj - tj + 1][bi - ti + 1]);
      blocks.set(sig, n);
    }
    return n;
  };
  // the root centred on (0, 0), as HashLife keeps it, wide enough for the blocks from -1 to the grid's far side
  let top = level + 1;
  while (2 ** (top - 1) < META_SIZE * (Math.max(cols, rows.length) + 1)) top++;
  const assemble = (l: number, x0: number, y0: number): HNode => {
    const size = 2 ** l;
    if (x0 + size <= -META_SIZE || y0 + size <= -META_SIZE || x0 > META_SIZE * cols || y0 > META_SIZE * rows.length) return h.empty(l);
    if (l === level) return block(x0 / META_SIZE, y0 / META_SIZE);
    const half = size / 2;
    return h.node(assemble(l - 1, x0, y0), assemble(l - 1, x0 + half, y0), assemble(l - 1, x0, y0 + half), assemble(l - 1, x0 + half, y0 + half));
  };
  h.root = assemble(top, -(2 ** (top - 1)), -(2 ** (top - 1)));
}

/** the face of metapixel (i, j): the square inside its machinery that is full of spaceships while it is ON */
export const faceOf = (i: number, j: number) => ({ x0: META_SIZE * i + 256, y0: META_SIZE * j + 256, x1: META_SIZE * i + 1791, y1: META_SIZE * j + 1791 });

/**
 * Each metapixel ON or OFF, read off its face (an ON face holds about 30,000 live cells, an OFF one none). A face
 * changes between about 4,900 and 7,400 generations into a cycle, and the first cycle changes none (it only sends the
 * metapixels' first signals to their neighbours, as metafier.py notes): meta generation k shows at 35,328 (k + 1).
 */
export function metaStates(count: (box: { x0: number; y0: number; x1: number; y1: number }) => number, cols: number, rows: number): number[][] {
  return Array.from({ length: rows }, (_, j) => Array.from({ length: cols }, (_, i) => (count(faceOf(i, j)) > 15_000 ? 1 : 0)));
}
