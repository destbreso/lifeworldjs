// Golly's History and Super families: a cell's next state as Golly 5.0 computes it (gollybase/superalgo.cpp, slowcalc,
// the Moore neighbourhood). Odd states are alive and count as neighbours, even ones are dead, and the base rule alone
// decides life, but for state 6, a boundary never born that kills a live cell beside it. The states keep a dead cell's
// history (2), marks (3, 4), starting cells (5), and in Super two more trail colours, cells with no trail, and labels
// that fade or cycle. Investigator, whose odd states need not be alive, is not here.

export type Family = "History" | "Super";

export const FAMILY_STATES: Record<Family, number> = { History: 7, Super: 26 };

const bits = (...s: number[]) => s.reduce((m, x) => m | (1 << x), 0);
const ODD_9_TO_25 = bits(9, 11, 13, 15, 17, 19, 21, 23, 25);
const ODD_13_TO_25 = bits(13, 15, 17, 19, 21, 23, 25);
const ALIVE_WITH_14 = bits(1, 3, 5, 7, 9, 11, 13, 14, 15, 17, 19, 21, 23, 25);
const ALIVE_WITH_14_OR_18 = ALIVE_WITH_14 | bits(18);
const ALIVE_1_3_5_7 = bits(1, 3, 5, 7);
const ALIVE_1_3_5_9_11 = bits(1, 3, 5, 9, 11);
const ALIVE_7_13_TO_25 = bits(7) | ODD_13_TO_25;
const ALIVE_1_5_7_9_11 = bits(1, 5, 7, 9, 11);
const ALIVE_9_11 = bits(9, 11);
const ALIVE_1_3_5_13_TO_25 = bits(1, 3, 5) | ODD_13_TO_25;

/** the one bit set in v, as a state (superalgo's firstbitset, only ever given a single bit) */
const onlyBit = (v: number) => 31 - Math.clz32(v);
const single = (v: number) => v !== 0 && (v & (v - 1)) === 0;

/**
 * A cell's next state from its own state `c`, a mask with a bit set for each state among its eight neighbours
 * (`typeMask`), and whether the base rule makes it alive next generation (`alive`, Golly's lookup, from which of the
 * neighbours and the cell itself are in odd states).
 */
export function nextState(family: Family, c: number, typeMask: number, alive: boolean): number {
  let result = c;
  let process = true;
  if (family === "History") {
    // beside a boundary a live cell dies, whatever the rule says
    if (typeMask & (1 << 6)) {
      process = false;
      if (c === 1) result = 2;
      else if (c === 3 || c === 5) result = 4;
      else process = true;
    }
    if (process) {
      if (alive) {
        if ((c & 1) === 0) {
          if (c === 4) result = 3;
          else if (c !== 6) result = 1;
        }
      } else if (c & 1) result = c === 5 ? 4 : c + 1;
    }
    return result;
  }
  if (typeMask & (1 << 6)) {
    process = false;
    if (c === 7 || c === 8 || c >= 13) result = 0;
    else if (c === 1) result = 2;
    else if (c === 3 || c === 5) result = 4;
    else if (c === 9) result = 10;
    else if (c === 11) result = 12;
    else process = true;
  }
  if (!process) return result;
  if (alive) {
    if ((c & 1) === 0) {
      if (c === 4) result = 3;
      else if (c === 8) result = 7;
      else if (c !== 6) {
        // a birth takes its live neighbours' state when they agree, as Golly's rules for it say, else 1, or 13
        result = 1;
        let calc = typeMask & ODD_9_TO_25;
        if ((typeMask & ALIVE_1_3_5_7) === 0 && single(calc)) result = onlyBit(calc);
        else {
          calc = typeMask & ODD_13_TO_25;
          if (typeMask & (1 << 3) && single(calc) && (typeMask & ALIVE_1_5_7_9_11) === 0) result = onlyBit(calc);
          else {
            calc = typeMask & ALIVE_9_11;
            if (typeMask & (1 << 7) && single(calc) && (typeMask & ALIVE_1_3_5_13_TO_25) === 0) result = onlyBit(calc);
            else {
              calc = typeMask & ALIVE_7_13_TO_25;
              if (calc && (typeMask & ALIVE_1_3_5_9_11) === 0) result = 13;
            }
          }
        }
      }
    }
  } else if (c & 1) result = c <= 11 ? (c === 5 ? 4 : c + 1) : 0;
  else if (c === 14) result = 0;
  else if (c === 16) result = typeMask & ALIVE_WITH_14 ? 14 : c;
  else if (c === 18) result = typeMask & (1 << 22) ? 22 : c;
  else if (c === 20) result = typeMask & (1 << 18) ? 18 : c;
  else if (c === 22) result = typeMask & (1 << 20) ? 20 : c;
  else if (c === 24) result = typeMask & ALIVE_WITH_14_OR_18 ? 18 : c;
  return result;
}

/**
 * Whether a cell in state `c` can change while nothing around it is born or dies: a Super label, and (in either family)
 * a cell beside a boundary, which the caller finds. The rest change only when the base rule changes them.
 */
export const restless = (family: Family, c: number) => family === "Super" && c >= 14 && (c & 1) === 0;

/** Golly's default colour of each state, 0xRRGGBB (superalgo.cpp; state 0 is the background). */
export const STATE_COLORS: Record<Family, number[]> = {
  History: [0x303030, 0x00ff00, 0x000080, 0xd8ffd8, 0xff0000, 0xffff00, 0x606060],
  Super: [
    0x303030, 0x00ff00, 0x0000a0, 0xffd8ff, 0xff0000, 0xffff00, 0x606060, 0xff69b4, 0x800080, 0x00bfff, 0x004080, 0x40e0d0, 0x008040, 0xffffff, 0xff6347, 0xfa8072, 0xdb7093, 0xffa500,
    0xf5deb3, 0x00ffff, 0xc0c0c0, 0xc0ff80, 0xffb6c1, 0x00ff7f, 0x010101, 0xff007f,
  ],
};

/** each state's name, as Golly's help gives it (Help/Algorithms/Super.html) */
export const STATE_NAMES: Record<Family, string[]> = {
  History: ["off", "on", "history: once on, now off", "marked on", "marked off", "start on", "boundary: never on, turns off what touches it"],
  Super: [
    "off",
    "on, trail 1",
    "trail 1: once on, now off",
    "marked on",
    "marked off",
    "start on",
    "boundary: never on, turns off what touches it",
    "marked on, no-trail boundary",
    "marked off, no-trail boundary",
    "on, trail 2",
    "trail 2",
    "on, trail 3",
    "trail 3",
    "on, no trail 1",
    "label that vanishes in a generation",
    "on, no trail 2",
    "label removed when touched",
    "on, no trail 3",
    "cycling label 1",
    "on, no trail 4",
    "cycling label 2",
    "on, no trail 5",
    "cycling label 3",
    "on, no trail 6",
    "hidden label, shown when touched",
    "on, no trail 7",
  ],
};

/** A rule name's family and its base rule: "LifeHistory" is History over B3/S23, "B36/S23Super" Super over B36/S23. */
export function splitFamily(rule: string): { base: string; family: Family | null } {
  const r = rule.trim();
  const m = /^(.*?)(History|Super)$/i.exec(r);
  if (!m) return { base: r, family: null };
  const family: Family = m[2].toLowerCase() === "history" ? "History" : "Super";
  return { base: /^life$/i.test(m[1]) || m[1] === "" ? "B3/S23" : m[1], family };
}

/** The name Golly gives a rule of a family: LifeHistory for Conway's, else the base rule with the suffix. */
export const familyRule = (base: string, family: Family) => `${base.toUpperCase() === "B3/S23" ? "Life" : base}${family}`;
