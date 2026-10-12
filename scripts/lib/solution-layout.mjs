/**
 * Source-layout rules for worked solutions inside djsSolution boxes.
 *
 * The box sets paragraph spacing, so blank lines in the source show in the
 * PDF. Solutions keep each lead-in directly above its display and leave one
 * blank line after every display. Running text uses \frac (not \dfrac),
 * symbol units are \,\mathrm{...}, and \left after a function name needs no
 * \! (the box loads mleftright). Pure helpers; I/O lives in
 * scripts/check-solution-layout.mjs.
 */

const RE_BRACKET_OPEN = /(?<!\\)\\\[/;
const RE_BRACKET_CLOSE = /(?<!\\)\\\]/g;
const RE_ENV_OPEN = /\\begin\{((?:align|equation|gather|alignat|multline|flalign)\*?)\}/;
const OPAQUE = 'tikzpicture|center|djsSolutionFigure|axis';
const RE_OPAQUE_BEGIN = new RegExp(`^\\\\begin\\{(${OPAQUE})\\}`);
const RE_OPAQUE_END = new RegExp(`^\\\\end\\{(${OPAQUE})\\}`);
const BLOCKS = 'enumerate|itemize|djsSolution|djsSolutionFigure|center|tikzpicture|figure|tabular';
const RE_STRUCT = new RegExp(`^\\\\(item\\b|begin\\{(${BLOCKS})\\}|end\\{(${BLOCKS})\\}|newpage)`);
const RE_SPACING = /^\\(vspace\*?\{|medskip|bigskip|smallskip)/;

const FUNCS = 'sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|arcsin|arccos|arctan|ln|log|exp';
const RE_BANG_LEFT = new RegExp(
  `(\\\\(?:${FUNCS})(?![A-Za-z])|\\\\operatorname\\{\\w+\\}|\\^\\{-1\\})\\s*\\\\!\\s*\\\\left`,
);
export const SYMBOL_UNITS = [
  'm s', 'rad s', 'L min', 'mg L', 'g L', 'ml min', 'mg min',
  'g/h', 'mg/L', 'mg/min', 'ml/min', 'L/min', 'g/min', 'g/L',
  'N', 'm', 'J', 's', 'W', 'cm', 'rad', 'g', 'kW', 'kg', 'mg', 'L',
];
const RE_TEXT_UNIT = new RegExp(
  `\\\\text\\{\\s+(${SYMBOL_UNITS.map((u) => u.replace(/[/]/g, '\\/')).join('|')})\\s*\\}`,
);

/**
 * Index pairs [begin, end] of the \begin{djsSolution} and \end{djsSolution}
 * lines.
 * @param {string[]} lines
 * @returns {[number, number][]}
 */
export function solutionBodies(lines) {
  const out = [];
  let start = -1;
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('\\begin{djsSolution}')) start = i;
    else if (t.startsWith('\\end{djsSolution}') && start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  });
  return out;
}

/**
 * Splits lines lo..hi (inclusive) into layout items. Displays may span
 * lines; TikZ pictures and similar blocks are opaque.
 * @param {string[]} lines
 * @param {number} lo
 * @param {number} hi
 */
export function layoutItems(lines, lo, hi) {
  const items = [];
  let depth = 0;
  for (let i = lo; i <= hi; i++) {
    const raw = lines[i];
    const s = raw.trim();
    if (depth > 0) {
      if (RE_OPAQUE_BEGIN.test(s)) depth++;
      if (RE_OPAQUE_END.test(s)) depth--;
      continue;
    }
    if (s === '') {
      items.push({ kind: 'blank', line: i });
      continue;
    }
    if (s.startsWith('%')) continue;
    if (RE_OPAQUE_BEGIN.test(s)) {
      items.push({ kind: 'struct', line: i, text: s });
      depth = 1;
      continue;
    }
    const br = RE_BRACKET_OPEN.exec(raw);
    const env = RE_ENV_OPEN.exec(raw);
    let open = null;
    let closer = null;
    if (br && (!env || br.index < env.index)) {
      open = br;
      closer = RE_BRACKET_CLOSE;
    } else if (env) {
      open = env;
      closer = new RegExp(`\\\\end\\{${env[1].replace('*', '\\*')}\\}`, 'g');
    }
    if (open) {
      const prefix = raw.slice(0, open.index).trim();
      let j = i;
      let suffix = '';
      closer.lastIndex = open.index + open[0].length;
      for (;;) {
        const m = closer.exec(lines[j]);
        if (m) {
          suffix = lines[j].slice(m.index + m[0].length).trim();
          break;
        }
        j++;
        closer.lastIndex = 0;
        if (j > hi) break;
      }
      items.push({ kind: 'display', line: i, end: Math.min(j, hi), prefix, suffix });
      i = Math.min(j, hi);
      continue;
    }
    if (RE_STRUCT.test(s)) items.push({ kind: 'struct', line: i, text: s });
    else if (RE_SPACING.test(s)) items.push({ kind: 'spacing', line: i, text: s });
    else items.push({ kind: 'text', line: i, text: s });
  }
  return items;
}

/**
 * [start, end) character ranges of inline maths on one line: \( ... \) and
 * single-dollar $ ... $.
 * @param {string} line
 * @returns {[number, number][]}
 */
export function inlineMathSpans(line) {
  const spans = [];
  let openAt = -1;
  let kind = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && i + 1 < line.length) {
      const n = line[i + 1];
      if (n === '(' && openAt < 0) {
        openAt = i + 2;
        kind = 'paren';
      } else if (n === ')' && kind === 'paren') {
        spans.push([openAt, i]);
        openAt = -1;
        kind = null;
      }
      i++;
      continue;
    }
    if (c === '$') {
      if (line[i + 1] === '$') {
        i++;
        continue;
      }
      if (openAt < 0) {
        openAt = i + 1;
        kind = 'dollar';
      } else if (kind === 'dollar') {
        spans.push([openAt, i]);
        openAt = -1;
        kind = null;
      }
    }
  }
  return spans;
}

/**
 * Layout problems inside the djsSolution boxes of one file. Line numbers
 * are 1-based.
 * @param {string} text
 * @returns {{ line: number; rule: string; message: string }[]}
 */
export function findLayoutIssues(text) {
  const lines = text.split(/\r?\n/);
  const issues = [];
  const add = (i, rule, message) => issues.push({ line: i + 1, rule, message });

  for (const [lo, hi] of solutionBodies(lines)) {
    const items = layoutItems(lines, lo + 1, hi - 1);
    const displayLines = new Set();
    for (const it of items) {
      if (it.kind !== 'display') continue;
      for (let n = it.line; n <= it.end; n++) displayLines.add(n);
    }

    items.forEach((it, k) => {
      if (it.kind !== 'display') return;
      if (!it.prefix) {
        let j = k - 1;
        while (j >= 0 && items[j].kind === 'blank') j--;
        const prev = items[j];
        if (j < k - 1 && prev) {
          const itemLeadIn = prev.kind === 'struct' && /^\\item\b\S*\s+\S/.test(prev.text);
          if (prev.kind === 'text' || itemLeadIn) {
            add(items[k - 1].line, 'blank-before-display',
              'blank line between a lead-in and its display; remove it');
          } else if (prev.kind === 'display' && !prev.suffix) {
            add(items[k - 1].line, 'blank-between-displays',
              'blank line between two displays; remove it');
          }
        }
      }
      const next = items[k + 1];
      if (!it.suffix && next && next.kind === 'text') {
        add(next.line, 'no-blank-after-display',
          'text directly after a display; leave a blank line after the display');
      }
    });

    let tabular = 0;
    for (let n = lo + 1; n < hi; n++) {
      const line = lines[n];
      for (const m of line.matchAll(/\\(begin|end)\{tabular\}/g)) tabular += m[1] === 'begin' ? 1 : -1;
      if (RE_BANG_LEFT.test(line)) {
        add(n, 'bang-before-left', 'no \\! between a function and \\left (mleftright spaces it)');
      }
      const inMath = displayLines.has(n);
      if (inMath && RE_TEXT_UNIT.test(line)) {
        add(n, 'text-unit', 'write units as \\,\\mathrm{...} rather than \\text{ ...}');
      }
      for (const [a, b] of inlineMathSpans(line)) {
        const seg = line.slice(a, b);
        if (!tabular && /\\dfrac(?![A-Za-z])/.test(seg)) {
          add(n, 'inline-dfrac', 'use \\frac, not \\dfrac, inside a sentence');
        }
        if (!inMath && RE_TEXT_UNIT.test(seg)) {
          add(n, 'text-unit', 'write units as \\,\\mathrm{...} rather than \\text{ ...}');
        }
      }
    }
  }
  return issues.sort((x, y) => x.line - y.line);
}
