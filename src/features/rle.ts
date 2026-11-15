// RLE, the format Life patterns are shared in (LifeWiki, Golly): rleToPattern and patternToRle move two-state cells
// in and out of a dense 0/1 matrix, a file's # lines and header skipped; parseRLE and formatRLE read and write a file
// with its states, rule and position as Golly writes them.

/**
 * Decode an RLE pattern into a dense 0/1 matrix (rows x cols).
 * Accepts either a full RLE file or bare cell data. Any `#` comment
 * lines and the `x = ...` header line are ignored; whitespace and
 * line wraps inside the body are insignificant, per the format.
 */
export function rleToPattern(rle: string): number[][] {
  const body = rle
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line) && !/^\s*x\s*=/i.test(line))
    .join("")
    .replace(/\s+/g, "");

  const cells: Array<[number, number]> = [];
  let row = 0;
  let col = 0;
  let count = "";
  let maxRow = 0;
  let maxCol = 0;

  for (const ch of body) {
    if (ch >= "0" && ch <= "9") {
      count += ch;
      continue;
    }
    const n = count ? parseInt(count, 10) : 1;
    count = "";
    if (ch === "b") {
      col += n;
    } else if (ch === "o") {
      for (let k = 0; k < n; k++) cells.push([row, col + k]);
      col += n;
      if (col - 1 > maxCol) maxCol = col - 1;
      if (row > maxRow) maxRow = row;
    } else if (ch === "$") {
      row += n;
      col = 0;
    } else if (ch === "!") {
      break;
    }
  }

  const grid: number[][] = Array.from({ length: maxRow + 1 }, () =>
    new Array(maxCol + 1).fill(0),
  );
  for (const [r, c] of cells) grid[r][c] = 1;
  return grid;
}

/**
 * Encode a dense 0/1 matrix into a full RLE string (header + body).
 * Trailing dead cells per row and trailing blank rows are dropped,
 * yielding the canonical compact form. `rule` defaults to Conway.
 */
export function patternToRle(pattern: number[][], rule = "B3/S23"): string {
  const h = pattern.length;
  const w = h ? Math.max(...pattern.map((r) => r.length)) : 0;

  const rows = pattern.map((r) => {
    let last = -1;
    for (let c = 0; c < r.length; c++) if (r[c]) last = c;
    let out = "";
    let runVal = -1;
    let runLen = 0;
    const flush = () => {
      if (runLen === 0) return;
      out += (runLen > 1 ? String(runLen) : "") + (runVal ? "o" : "b");
      runLen = 0;
    };
    for (let c = 0; c <= last; c++) {
      const v = r[c] ? 1 : 0;
      if (v === runVal) runLen++;
      else {
        flush();
        runVal = v;
        runLen = 1;
      }
    }
    flush();
    return out; // "" for a blank row
  });

  let body = "";
  let pendingNewlines = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) pendingNewlines++;
    if (rows[i] === "") continue; // defer the newline(s) until real content
    if (pendingNewlines > 0) {
      body += (pendingNewlines > 1 ? String(pendingNewlines) : "") + "$";
      pendingNewlines = 0;
    }
    body += rows[i];
  }
  body += "!";

  return `x = ${w}, y = ${h}, rule = ${rule}\n${body}`;
}

/* ── The whole file: its header and comments, and Golly's multi-state form ──
   rleToPattern above keeps only the cells. parseRLE also reads the name (#N), the author (#O), the comments (#C) and
   the rule, and the states 1 to 24 Golly writes as A to X (a simulation can carry its own meaning in them: the Game of
   Life page, a cell's colour). formatRLE writes cells back, multi-state only when a cell is not plain "o". */

export interface ParsedRLE {
  /** live cells, x across and y down from the pattern's corner, with their state (1 for a plain "o") */
  cells: [number, number, number][];
  width: number;
  height: number;
  rule?: string;
  name?: string;
  author?: string;
  comments: string[];
}

// Golly's History and Super rules, LifeHistory, B36/S23History, LifeSuper, are their base rule with marks drawn in more
// states: the odd ones alive, the even ones dead, the history, the marked dead cells and the boundary among them
const MARKED = /(History|Super)$/i;

/** A file's live cells, x across and y down: in a History or Super rule only its odd states, as Golly runs it. */
export function liveCells(p: ParsedRLE, rule = p.rule): [number, number][] {
  const cells = rule && MARKED.test(rule) ? p.cells.filter(([, , s]) => s % 2 === 1) : p.cells;
  return cells.map(([x, y]) => [x, y]);
}

/** The rule a file names, as B/S without Golly's marks: LifeHistory, LifeSuper and Life are B3/S23, and "23/3" B3/S23. */
export function baseRule(rule: string): string {
  const r = rule.trim().replace(MARKED, "");
  if (/^life$/i.test(r)) return "B3/S23";
  const sb = /^(\d*)\/(\d*)$/.exec(r);
  return sb ? `B${sb[2]}/S${sb[1]}` : r.replace(/^b/, "B").replace(/\/s/, "/S");
}

/**
 * Whether text is a pattern in RLE rather than other text: a header line, or a body of runs alone
 * (as one is often shared, without its header).
 */
export function looksLikeRLE(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (!lines.length) return false;
  if (/^x\s*=\s*\d+\s*,\s*y\s*=\s*\d+/.test(lines[0])) return true;
  return lines.every((l) => /^[\dbo$!.\s]+$/.test(l)) && lines.some((l) => l.includes("o"));
}

export function parseRLE(text: string): ParsedRLE {
  const out: ParsedRLE = { cells: [], width: 0, height: 0, comments: [] };
  let body = "";
  let header = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const tag = line[1],
        rest = line.slice(2).trim();
      if (tag === "N") out.name = rest;
      else if (tag === "O") out.author = rest;
      else if (tag === "C" || tag === "c") out.comments.push(rest);
      continue;
    }
    if (!header && /^x\s*=/.test(line)) {
      header = true;
      const w = /x\s*=\s*(\d+)/.exec(line),
        h = /y\s*=\s*(\d+)/.exec(line),
        r = /rule\s*=\s*([^,\s]+)/.exec(line);
      if (w) out.width = +w[1];
      if (h) out.height = +h[1];
      if (r) out.rule = r[1];
      continue;
    }
    body += line;
    if (line.includes("!")) break;
  }
  let x = 0,
    y = 0,
    run = "",
    prefix = "";
  for (const ch of body) {
    // whitespace inside the body means nothing: read as a cell, it put stray live cells on the board
    if (ch === " " || ch === "\t") continue;
    if (ch >= "0" && ch <= "9") {
      run += ch;
      continue;
    }
    if (ch === "!") break;
    const n = run ? +run : 1;
    run = "";
    if (ch === "p" || ch === "q" || ch === "r" || ch === "s" || ch === "t" || ch === "u" || ch === "v" || ch === "w" || ch === "x" || ch === "y") {
      // Golly writes states above 24 with a prefix letter; none are used here, but they are read past
      prefix = ch;
      run = String(n === 1 && !run ? "" : n);
      continue;
    }
    if (ch === "$") {
      y += n;
      x = 0;
    } else if (ch === "b" || ch === ".") {
      x += n;
    } else if (ch === "o" || (ch >= "A" && ch <= "X")) {
      const state = ch === "o" ? 1 : ch.charCodeAt(0) - 64 + (prefix ? (prefix.charCodeAt(0) - 111) * 24 : 0);
      for (let i = 0; i < n; i++) out.cells.push([x + i, y, state]);
      x += n;
    } else {
      // any other letter is a live cell in a two-state reading
      for (let i = 0; i < n; i++) out.cells.push([x + i, y, 1]);
      x += n;
    }
    prefix = "";
  }
  if (!out.width || !out.height) {
    for (const [cx, cy] of out.cells) {
      out.width = Math.max(out.width, cx + 1);
      out.height = Math.max(out.height, cy + 1);
    }
  }
  return out;
}

/**
 * Cells as RLE. `state` gives each cell's state (1 to 24); left out, every cell is "o". Lines are kept under 70
 * characters, as the format asks.
 */
export function formatRLE(cells: [number, number, number?][], opts: { rule?: string; name?: string; author?: string; comments?: string[] } = {}): string {
  if (!cells.length) return `x = 0, y = 0, rule = ${opts.rule ?? "B3/S23"}\n!\n`;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of cells) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  const multi = cells.some(([, , s]) => s !== undefined && s !== 1);
  const rows = new Map<number, Map<number, number>>();
  for (const [x, y, s] of cells) {
    let r = rows.get(y - y0);
    if (!r) rows.set(y - y0, (r = new Map()));
    r.set(x - x0, s ?? 1);
  }
  // states 1 to 24 are A to X, and past them a prefix: 25 is pA, as Golly writes them
  const live = (s: number) => {
    if (!multi) return "o";
    const k = Math.floor((s - 1) / 24);
    return (k ? String.fromCharCode(111 + k) : "") + String.fromCharCode(64 + s - 24 * k);
  };
  const dead = multi ? "." : "b";
  const tokens: string[] = [];
  const push = (n: number, c: string) => tokens.push(n > 1 ? `${n}${c}` : c);
  let pendingRows = 0;
  for (let y = 0; y <= y1 - y0; y++) {
    const r = rows.get(y);
    if (!r) {
      pendingRows++;
      continue;
    }
    if (pendingRows || tokens.length) push(pendingRows + (tokens.length ? 1 : 0), "$");
    pendingRows = 0;
    const xs = [...r.keys()].sort((a, b) => a - b);
    let x = 0;
    let i = 0;
    while (i < xs.length) {
      if (xs[i] > x) push(xs[i] - x, dead);
      const s = r.get(xs[i])!;
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1 && r.get(xs[j + 1]) === s) j++;
      push(j - i + 1, live(s));
      x = xs[j] + 1;
      i = j + 1;
    }
  }
  tokens.push("!");
  const lines: string[] = [];
  if (opts.name) lines.push(`#N ${opts.name}`);
  if (opts.author) lines.push(`#O ${opts.author}`);
  for (const c of opts.comments ?? []) lines.push(`#C ${c}`);
  lines.push(`x = ${x1 - x0 + 1}, y = ${y1 - y0 + 1}, rule = ${opts.rule ?? "B3/S23"}`);
  let line = "";
  for (const t of tokens) {
    if (line.length + t.length > 69) {
      lines.push(line);
      line = "";
    }
    line += t;
  }
  if (line) lines.push(line);
  return lines.join("\n") + "\n";
}
