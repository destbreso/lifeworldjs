// sim/life/rules: a rule as Golly writes it, read into what the engines run (Golly 5.0's gollybase/liferules.cpp, the
// Moore neighbourhood). A totalistic rule (B3/S23, its S/B form 23/3, or Life) is birth and survival counts, which the
// engines add up fast; an isotropic non-totalistic rule in Hensel's notation (B2e3air/S1c23-knqy, each letter after a
// count one shape of that many neighbours, a minus taking the letters after it away) or a MAP rule (any of the 512
// neighbourhoods, in base64) is a table of 512: alive or dead next for each 3 by 3 neighbourhood, indexed as Golly
// indexes it, nw n ne / w c e / sw s se from the highest bit to the lowest. Rules with B0, bounded grids, Generations and
// other neighbourhoods are refused with the reason: the engines do not run them.

export interface ParsedRule {
  /** the counts of neighbours a birth or a survival can have (for a table, every count one of its shapes has) */
  birth: number[];
  survival: number[];
  /** a rule that is not totalistic: next for each of the 512 neighbourhoods */
  table?: Uint8Array;
  /** the rule as it is written */
  name: string;
}

/** Hensel's letters, in Golly's order: each count of neighbours takes a prefix of them */
export const HENSEL = "ceaiknjqrytwz";
/** how many of the letters each count takes, 0 to 8 */
const LETTERS_OF = [0, 2, 6, 10, 13, 10, 6, 2, 0];
/** one neighbourhood of each shape, for 1 to 4 neighbours, as a 9-bit index (Golly's rule_neighborhoods); 5 to 7 are
 *  the complements of 3 to 1 */
const SHAPES = [
  [1, 2],
  [5, 10, 3, 40, 33, 68],
  [69, 42, 11, 7, 98, 13, 14, 70, 41, 97],
  [325, 170, 15, 45, 99, 71, 106, 102, 43, 101, 105, 78, 108],
];
const CENTRE = 0x10;
const NEIGHBOURS = 0x1ef;

const flip = (x: number) => ((x & 0x07) << 6) | ((x & 0x1c0) >> 6) | (x & 0x38);
const rotate = (x: number) =>
  ((x & 0x4) << 6) | ((x & 0x20) << 2) | ((x & 0x100) >> 2) | ((x & 0x2) << 4) | (x & 0x10) | ((x & 0x80) >> 4) | ((x & 0x1) << 2) | ((x & 0x8) >> 2) | ((x & 0x40) >> 6);
const count = (x: number) => {
  let n = 0;
  for (x &= NEIGHBOURS; x; x &= x - 1) n++;
  return n;
};

/** a neighbourhood and its seven images under the square's turns and mirrors, all set to `v` */
function setShape(table: Uint8Array, x: number, v: number) {
  let y = x;
  for (let i = 0; i < 4; i++, y = rotate(y)) table[y] = v;
  y = flip(y);
  for (let i = 0; i < 4; i++, y = rotate(y)) table[y] = v;
}

/** every neighbourhood of `n` neighbours, for a birth (centre dead) or a survival (centre alive), set alive */
function setCount(table: Uint8Array, n: number, survival: boolean) {
  for (let x = 0; x < 512; x++) if (!!(x & CENTRE) === survival && count(x) === n) table[x] = 1;
}

/** one shape of `n` neighbours (its letter's index in HENSEL), set to `v` */
function setLetter(table: Uint8Array, n: number, letter: number, survival: boolean, v: number) {
  const i = n - 1;
  const x = (i > 3 ? SHAPES[6 - i][letter] ^ NEIGHBOURS : SHAPES[i][letter]) | (survival ? CENTRE : 0);
  setShape(table, x, v);
}

/** a birth or survival part ("2e3air4k", "1c23-knqy") into the table; an error's reason, or null */
function readPart(part: string, table: Uint8Array, survival: boolean): string | null {
  let i = 0;
  while (i < part.length) {
    const d = part.charCodeAt(i) - 48;
    if (d < 0 || d > 8) return `"${part[i]}" is not a count of neighbours`;
    i++;
    const minus = part[i] === "-";
    // (a count with no letters after it, or a minus, takes every shape; the letters after a minus are taken away)
    if (minus || i >= part.length || !HENSEL.includes(part[i])) setCount(table, d, survival);
    if (minus) i++;
    while (i < part.length && HENSEL.includes(part[i])) {
      const letter = HENSEL.indexOf(part[i]);
      if (letter >= LETTERS_OF[d]) return `${d} neighbours have no shape "${part[i]}"`;
      setLetter(table, d, letter, survival, minus ? 0 : 1);
      i++;
    }
    if (minus && !HENSEL.includes(part[i - 1])) return `a minus after ${d} needs letters after it`;
  }
  return null;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** A MAP rule's 512 bits, the first for neighbourhood 0 (Golly's createRuleMapFromMAP). */
function readMap(b64: string): Uint8Array | null {
  const s = b64.replace(/==$/, "");
  if (s.length !== 86 || [...s].some((c) => BASE64.indexOf(c) < 0)) return null;
  const table = new Uint8Array(512);
  for (let i = 0; i < 512; i++) table[i] = (BASE64.indexOf(s[Math.floor(i / 6)]) >> (5 - (i % 6))) & 1;
  return table;
}

/** A table as a MAP rule, Golly's base64 of its 512 bits. */
export function mapOf(table: Uint8Array): string {
  let out = "";
  for (let c = 0; c < 86; c++) {
    let v = 0;
    for (let b = 0; b < 6; b++) v = (v << 1) | (table[c * 6 + b] ?? 0);
    out += BASE64[v];
  }
  return `MAP${out}`;
}

const countsOf = (table: Uint8Array, survival: boolean) => [...new Set([...Array(512).keys()].filter((x) => table[x] && !!(x & CENTRE) === survival).map(count))].sort((a, b) => a - b);

/** A rule as Golly writes it, without a History or Super suffix (sim/life/super.ts splits that off), or why not. */
export function parseRule(text: string): ParsedRule | { error: string } {
  const r = text.trim();
  if (!r) return { error: "no rule" };
  if (/^life$/i.test(r)) return { birth: [3], survival: [2, 3], name: "B3/S23" };
  if (r.includes(":")) return { error: `a bounded grid (${r.slice(r.indexOf(":"))}) is not run here: the board has no edges` };
  if (/^map/i.test(r)) {
    const table = readMap(r.slice(3));
    if (!table) return { error: "a MAP rule of the Moore neighbourhood has 86 base64 characters" };
    if (table[0]) return { error: "a birth from no neighbours (B0) is not run here" };
    return { birth: countsOf(table, false), survival: countsOf(table, true), table, name: r.slice(0, 3).toUpperCase() + r.slice(3) };
  }
  if (/^\d*\/\d*\/\d+$/.test(r) || /\/[cg]\d+$/i.test(r)) return { error: "a Generations rule (cells that fade over several states) is not run here" };
  if (/[hv]$/i.test(r) && /\d[hv]$/i.test(r)) return { error: "a hexagonal or von Neumann neighbourhood is not run here" };
  let b: string, s: string;
  const sb = /^(\d*)\/(\d*)$/.exec(r);
  if (sb) [s, b] = [sb[1], sb[2]];
  else {
    const m = /^b([0-8a-z-]*)\/?s([0-8a-z-]*)$/i.exec(r) ?? /^s([0-8a-z-]*)\/?b([0-8a-z-]*)$/i.exec(r);
    if (!m) return { error: `"${r}" is not a rule this board reads` };
    [b, s] = /^b/i.test(r) ? [m[1], m[2]] : [m[2], m[1]];
  }
  b = b.toLowerCase();
  s = s.toLowerCase();
  const table = new Uint8Array(512);
  const err = readPart(b, table, false) ?? readPart(s, table, true);
  if (err) return { error: err };
  if (table[0]) return { error: "a birth from no neighbours (B0) is not run here" };
  const name = `B${b}/S${s}`;
  // (written without letters, it is totalistic: the counts alone, which the engines add up fast)
  if (!/[a-z]/.test(b + s)) return { birth: countsOf(table, false), survival: countsOf(table, true), name };
  return { birth: countsOf(table, false), survival: countsOf(table, true), table, name };
}
