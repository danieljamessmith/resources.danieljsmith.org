/**
 * Mark schemes: the data beside a Further Maths pack, its reader, its
 * canonical writer and its checker.
 *
 * A pack's scheme is one YAML file, `<section>/ms/_QBT___MS__<stem>.yaml`,
 * beside the pack's `qbt/` and `soln/` folders. It holds, per question and
 * per part (one part per `\marks`), the rows of the Scheme column and their
 * marks. No counts are stored: a part's total is its `\marks`.
 *
 * - `readPack` reads what the scheme is checked against: the questions
 *   file's header title, and per question its stamp, statement, solution
 *   box, counted figures and parts (labels and `\marks`).
 * - `parseYaml` reads YAML 1.2 (core schema), so `no` and `on` stay strings.
 * - `emitScheme` writes the canonical form: two-space indents, the fields in
 *   a fixed order, every `scheme` a literal block and every other string
 *   plain where YAML allows it (single-quoted otherwise, a literal block when
 *   it spans lines).
 * - `checkScheme` runs rules 1-24 on a scheme file; `checkQuestion` runs
 *   rules 4-23 and rule 1's fields and types on one question, for an
 *   external drafting tool's accept.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import YAML from 'yaml';
import { isValidPackDate } from './pack-preamble.mjs';
import {
  extractQbtStatement,
  findSolutionClose,
  parseDoc,
  SOLUTION_OPEN_RE,
  validateBlocks,
} from './question-blocks.mjs';
import { codePart, normalizePath } from './tex-utils.mjs';

export const FORMAT = 1;

/** The closed list of mark codes. `A1 AG` is one mark: AG qualifies the A1. */
export const CODES = ['M1', 'dM1', 'A1', 'A1ft', 'A1 AG', 'B1', 'B1ft', 'E1'];
const A_CODES = new Set(['A1', 'A1ft', 'A1 AG']);
const METHOD_CODES = new Set(['M1', 'dM1']);
const GIVEN = 'A1 AG';
const NOTE_REQUIRED = new Set(['M1', 'dM1', 'E1', 'A1ft', 'B1ft']);
const VERB_NOTE = new Set(['M1', 'dM1', 'E1']);
const FIGURE_CODES = new Set(['B1', 'B1ft']);

export const FEATURES = [
  'shape',
  'intercepts',
  'asymptotes',
  'turning points',
  'end behaviour',
  'symmetry',
  'shading',
  'labelled point',
  'centre and radius',
  'half-line',
];

/** Flag kinds. `not_drafted` is written by an external drafting tool when every attempt failed, never in an answer. */
export const FLAG_KINDS = ['solution_error', 'figure_missing', 'not_drafted'];
const MODEL_FLAG_KINDS = new Set(['solution_error', 'figure_missing']);

/** The verbs an M1, dM1 or E1 note may open with (rule 18). */
export const NOTE_VERBS = new Set(
  `Adds Applies Argues Assumes Attempts Begins Calculates Cancels Carries
  Checks Chooses Clears Collects Combines Compares Completes Concludes
  Conjugates Considers Constructs Converts Deduces Defines Differentiates
  Divides Draws Eliminates Equates Evaluates Expands Explains Expresses
  Factorises Finds Forms Gives Halves Identifies Integrates Interprets
  Inverts Justifies Lets Links Lists Makes Marks Maximises Minimises
  Multiplies Names Notes Obtains Pairs Postmultiplies Premultiplies Proves
  Puts Raises Rationalises Reaches Rearranges Recognises Refers Reflects
  Relates Replaces Resolves Rewrites Rotates Separates Sets Shows Simplifies
  Sketches Solves Splits Squares States Substitutes Subtracts Sums Takes
  Tests Translates Uses Verifies Works Writes`.split(/\s+/),
);

/** Board abbreviations the notes never use (rule 16), matched as words. */
const BANNED_ABBREVIATIONS = [
  'bod', 'www', 'rot', 'PI', 'BC', 'DR', 'dep', 'indep', 'ACF', 'AWFW', 'NMS', 'CWO',
];
const ALLOWED_CAPITALS = new Set(['AG', 'SC', 'LHS', 'RHS', 'KE', 'GPE', 'EPE']);
const NOTE_WORD_LIMIT = 35;

/** Fields that wait until after the first version, with what to do instead. */
const NOT_YET = {
  part_notes: 'part notes are not in this version',
  width: 'figure widths are not in this version',
  place: 'there is no `place`: every figure is set on a full row',
};

const SCHEMA = {
  file: [
    ['format', 'int'],
    ['pack', 'str'],
    ['last_updated', 'str'],
    ['questions', ['seq', 'question']],
  ],
  question: [
    ['q', 'int'],
    ['stamp', 'str'],
    ['parts', ['seq', 'part']],
  ],
  part: [
    ['part', 'str'],
    ['rows', ['seq', 'row']],
    ['alt', ['map', 'alt']],
    ['flag', ['map', 'flag']],
  ],
  alt: [
    ['title', 'str'],
    ['rows', ['seq', 'row']],
  ],
  flag: [
    ['kind', 'str'],
    ['why', 'str'],
  ],
  row: [
    ['scheme', 'block'],
    ['figure', 'int'],
    ['marks', ['seq', 'mark']],
  ],
  mark: [
    ['code', 'str'],
    ['note', 'str'],
    ['feature', 'str'],
    ['depends_on', 'str'],
    ['query', ['map', 'query']],
  ],
  query: [
    ['code', 'str'],
    ['why', 'str'],
  ],
};

const REQUIRED = {
  file: ['format', 'pack', 'last_updated', 'questions'],
  question: ['q', 'stamp', 'parts'],
  part: ['part'],
  alt: ['rows'],
  flag: ['kind', 'why'],
  row: [],
  mark: ['code'],
  query: ['code', 'why'],
};

// ---- Paths ------------------------------------------------------------------

/**
 * The pack's files, from its questions file's path:
 * `<section>/qbt/_QBT__<stem>.tex`, `<section>/soln/_QBT___Solns__<stem>.tex`
 * and the scheme, `<section>/ms/_QBT___MS__<stem>.yaml`.
 *
 * @param {string} qbtPath
 */
export function packPaths(qbtPath) {
  const name = basename(qbtPath);
  const match = /^_QBT__(?!_Solns__|_MS__)(.+)\.tex$/.exec(name);
  if (!match || basename(dirname(qbtPath)) !== 'qbt') {
    throw new Error(`${normalizePath(qbtPath)} is not a pack's questions file (qbt/_QBT__<name>.tex)`);
  }
  const stem = match[1];
  const sectionDir = dirname(dirname(qbtPath));
  return {
    stem,
    sectionDir,
    qbt: qbtPath,
    soln: join(sectionDir, 'soln', `_QBT___Solns__${stem}.tex`),
    scheme: join(sectionDir, 'ms', `_QBT___MS__${stem}.yaml`),
  };
}

/**
 * The questions file a scheme belongs to, from the scheme's path.
 *
 * @param {string} schemePath
 */
export function qbtPathForScheme(schemePath) {
  const name = basename(schemePath);
  const match = /^_QBT___MS__(.+)\.yaml$/.exec(name);
  if (!match || basename(dirname(schemePath)) !== 'ms') {
    throw new Error(`${normalizePath(schemePath)} is not a scheme (ms/_QBT___MS__<name>.yaml)`);
  }
  return join(dirname(dirname(schemePath)), 'qbt', `_QBT__${match[1]}.tex`);
}

// ---- Reading a pack's marks ---------------------------------------------------

const QUESTION_MARKER = /^% (?:-{4}|={10}) Question (\d+) (?:-{4}|={10})[ \t]*$/;
const TOKEN_RE =
  /\\begin\{(enumerate|itemize|description)\}|\\end\{(enumerate|itemize|description)\}|(\\item)(?![A-Za-z@])|(\\marks)(?![A-Za-z@])/g;
const MARKS_ARGS_RE = /\s*(?:\[([^\]]*)\])?\s*\{\s*(\d+)\s*\}/y;
const LABEL_FORMAT_RE = /\\(alph|Alph|roman|Roman|arabic)\*/;
const LABEL_KEY_RE = /\blabel\s*=/;
const START_RE = /\bstart\s*=\s*(\d+)/;
const RESUME_RE = /\bresume\b/;
/** LaTeX's labels for an enumerate with no `label=`, by depth. */
const DEFAULT_STYLES = { 1: 'arabic', 2: 'alph', 3: 'roman', 4: 'Alph' };

function roman(n) {
  const numerals = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let out = '';
  for (const [value, numeral] of numerals) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

function itemLabel(style, n) {
  if (style === 'arabic') return String(n);
  if (style === 'roman') return roman(n);
  if (style === 'Roman') return roman(n).toUpperCase();
  if (n > 26) return null;
  const letter = String.fromCharCode(96 + n);
  return style === 'alph' ? letter : letter.toUpperCase();
}

/** The `[...]` options at or after `pos` (after spaces), and where they end. */
function optionsAt(text, pos) {
  let i = pos;
  while (i < text.length && ' \t\n'.includes(text[i])) i++;
  if (i >= text.length || text[i] !== '[') return ['', pos];
  let depth = 0;
  for (let j = i + 1; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === ']' && depth === 0) return [text.slice(i + 1, j), j + 1];
  }
  throw new Error("an enumerate's options never close");
}

/**
 * Every `\marks` in a questions file: its question, its part label, its line
 * and its count. Labels are those the PDF prints, read from the `enumerate`
 * nesting below the question list, their levels joined by dots (`b.ii`), or
 * `""` for a mark on the whole question. Where the nesting can't be read, or
 * two marks in a question would share a label, a mark is named by its place
 * among the question's marks (`#2`). An offset `\marks[...]{n}` counts.
 *
 * @param {string} text
 * @returns {{ q: number, part: string, line: number, count: number }[]}
 */
export function packMarks(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  /** @type {[number, number][]} line number (1-based), question */
  const questionStarts = [];
  const clean = [];
  lines.forEach((line, i) => {
    const marker = QUESTION_MARKER.exec(line);
    if (marker) questionStarts.push([i + 1, Number(marker[1])]);
    clean.push(line.replace(/(?<!\\)%.*$/, ''));
  });
  const body = clean.join('\n');
  const lineStarts = [0];
  for (const line of clean.slice(0, -1)) lineStarts.push(lineStarts[lineStarts.length - 1] + line.length + 1);
  const lineOf = (offset) => {
    let lo = 0;
    let hi = lineStarts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lineStarts[mid] <= offset) lo = mid + 1;
      else hi = mid;
    }
    return lo; // 1-based line number
  };

  const stack = [];
  const root = { kind: 'root', style: null, counter: 0, custom: false, lastEnumerate: 0 };
  const found = [];
  const linesUsed = new Set();
  let pos = 0;
  for (;;) {
    TOKEN_RE.lastIndex = pos;
    const token = TOKEN_RE.exec(body);
    if (!token) break;
    pos = TOKEN_RE.lastIndex;
    const parent = stack.length ? stack[stack.length - 1] : root;
    if (token[1]) {
      const frame = { kind: token[1], style: null, counter: 0, custom: false, lastEnumerate: 0 };
      if (frame.kind === 'enumerate') {
        let options;
        [options, pos] = optionsAt(body, pos);
        const depth = 1 + stack.filter((f) => f.kind === 'enumerate').length;
        const style = LABEL_FORMAT_RE.exec(options);
        if (style) frame.style = style[1];
        else if (!LABEL_KEY_RE.test(options)) frame.style = DEFAULT_STYLES[depth] ?? null;
        const start = START_RE.exec(options);
        if (start) frame.counter = Number(start[1]) - 1;
        else if (RESUME_RE.test(options)) frame.counter = parent.lastEnumerate;
      }
      stack.push(frame);
    } else if (token[2]) {
      while (stack.length) {
        const closed = stack.pop();
        if (closed.kind === token[2]) {
          if (closed.kind === 'enumerate') {
            (stack.length ? stack[stack.length - 1] : root).lastEnumerate = closed.counter;
          }
          break;
        }
      }
    } else if (token[3]) {
      if (stack.length) {
        const [, after] = optionsAt(body, pos);
        parent.counter += 1;
        parent.custom = after !== pos;
        pos = after;
      }
    } else {
      const number = lineOf(token.index);
      MARKS_ARGS_RE.lastIndex = pos;
      const args = MARKS_ARGS_RE.exec(body);
      if (!args) throw new Error(`line ${number}: \\marks without a count`);
      pos = MARKS_ARGS_RE.lastIndex;
      let at = -1;
      for (let i = 0; i < questionStarts.length && questionStarts[i][0] <= number; i++) at = i;
      if (!stack.length || at < 0) throw new Error(`line ${number}: \\marks outside any question`);
      if (linesUsed.has(number)) throw new Error(`line ${number}: two \\marks on one line`);
      linesUsed.add(number);
      let parts = [];
      for (const frame of stack.slice(1)) {
        if (frame.kind !== 'enumerate') continue;
        const item =
          frame.style && frame.counter > 0 && !frame.custom ? itemLabel(frame.style, frame.counter) : null;
        if (item === null) {
          parts = null;
          break;
        }
        parts.push(item);
      }
      found.push({
        q: questionStarts[at][1],
        part: parts === null ? null : parts.join('.'),
        line: number,
        count: Number(args[2]),
      });
    }
  }

  const byQuestion = new Map();
  for (const mark of found) {
    if (!byQuestion.has(mark.q)) byQuestion.set(mark.q, []);
    byQuestion.get(mark.q).push(mark);
  }
  for (const marks of byQuestion.values()) {
    const used = new Map();
    for (const m of marks) used.set(m.part, (used.get(m.part) ?? 0) + 1);
    marks.forEach((m, i) => {
      if (m.part === null || used.get(m.part) > 1) m.part = `#${i + 1}`;
    });
  }
  return found;
}

/** A part's label as the PDF prints it: `Q3(b)(ii)`, `Q3`, or `Q3 #2`. */
export function partLabel(q, part) {
  if (!part) return `Q${q}`;
  if (part.startsWith('#')) return `Q${q} ${part}`;
  return `Q${q}${part.split('.').map((p) => `(${p})`).join('')}`;
}

// ---- Reading a pack ---------------------------------------------------------

const SOURCE_HINT_RE = /^\s*% \[Source: [^\]]*\]\s*$/;
const PICTURE_TOKEN_RE = /\\(begin|end)\{tikzpicture\}/g;
const FIGURE_TOKEN_RE = /\\(begin|end)\{(tikzpicture|enumerate|itemize|description)\}/g;
const DEFINITION_RE = /\\(?:pgfmathsetmacro|def|newcommand)(?![A-Za-z])/;

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end);
}

/** A question's statement: its lines after `\questionitem`, without the source hint. */
function statementLines(block) {
  const lines = extractQbtStatement(block).filter((l) => !SOURCE_HINT_RE.test(l));
  const i = lines.findIndex((l) => /\\questionitem(?![A-Za-z@])/.test(l));
  if (i >= 0) {
    const rest = lines[i].replace(/\\questionitem(?![A-Za-z@])/, '');
    if (rest.trim() === '') lines.splice(i, 1);
    else lines[i] = rest;
  }
  return trimBlankLines(lines);
}

/**
 * The pictures of a solution box that `figure: N` can name: each top-level
 * `tikzpicture` (one inside `djsSolutionFigure` included, one nested in
 * another not), by the line it starts on. Also whether the box defines
 * anything outside its pictures, which a picture copied alone would lose,
 * and each picture's list depth: the lists open around it in the box, as
 * its line width there depends on them.
 *
 * @param {string[]} lines
 */
export function solutionFigures(lines) {
  const starts = [];
  const depths = [];
  let depth = 0;
  let lists = 0;
  let outside = '';
  lines.forEach((line, i) => {
    const code = codePart(line);
    let last = 0;
    for (const m of code.matchAll(FIGURE_TOKEN_RE)) {
      if (m[2] !== 'tikzpicture') {
        if (depth === 0) lists = Math.max(0, lists + (m[1] === 'begin' ? 1 : -1));
        continue;
      }
      if (depth === 0) outside += code.slice(last, m.index);
      if (m[1] === 'begin') {
        if (depth === 0) {
          starts.push(i);
          depths.push(lists);
        }
        depth++;
      } else if (depth > 0) {
        depth--;
      }
      last = m.index + m[0].length;
    }
    if (depth === 0) outside += `${code.slice(last)}\n`;
  });
  return { starts, depths, definesOutside: DEFINITION_RE.test(outside) };
}

/**
 * The source of each picture `solutionFigures` counts, in order: from its
 * `\begin{tikzpicture}` to the matching `\end`, with comments and blank
 * lines removed and the common indent taken off. A comment straight after
 * code leaves its `%`, which keeps the line's end out of the output as the
 * comment did.
 *
 * @param {string[]} lines
 * @returns {string[]}
 */
export function solutionPictures(lines) {
  const pictures = [];
  let depth = 0;
  let current = null;
  for (const line of lines) {
    const code = codePart(line);
    const joined = code !== line && code !== '' && !/\s$/.test(code) ? `${code}%` : code;
    let from = 0;
    PICTURE_TOKEN_RE.lastIndex = 0;
    for (const m of code.matchAll(PICTURE_TOKEN_RE)) {
      if (m[1] === 'begin') {
        if (depth === 0) {
          current = [];
          from = m.index;
        }
        depth++;
      } else if (depth > 0) {
        depth--;
        if (depth === 0) {
          current.push(code.slice(from, m.index + m[0].length));
          pictures.push(current);
          current = null;
        }
      }
    }
    if (current && depth > 0) current.push(joined.slice(from));
  }
  return pictures.map((pic) => {
    const kept = pic.map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');
    const indents = kept.slice(1).map((l) => /^[ \t]*/.exec(l)[0].length);
    const cut = indents.length ? Math.min(...indents) : 0;
    return kept.map((l, i) => (i === 0 ? l.trimStart() : l.slice(cut))).join('\n');
  });
}

/** Whitespace collapsed, for the stamp. */
function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A question's stamp: the first 8 hex characters of an md5 of its statement
 * and its solution box, whitespace collapsed.
 *
 * @param {string} statement
 * @param {string} solution
 */
export function questionStamp(statement, solution) {
  return createHash('md5')
    .update(`${collapse(statement)}\n${collapse(solution)}`)
    .digest('hex')
    .slice(0, 8);
}

/**
 * @typedef {Object} PackQuestion
 * @property {number} q
 * @property {string} stamp
 * @property {string} statement
 * @property {string} solution         - The solution box's body
 * @property {string} solutionMarked   - The same, with `% figure N` before each counted picture
 * @property {number} figures
 * @property {boolean} definesOutside
 * @property {{ part: string, marks: number }[]} parts
 */

/**
 * @typedef {Object} Pack
 * @property {string} title       - As the questions file's header writes it (LaTeX)
 * @property {string | null} strand
 * @property {string | null} section
 * @property {PackQuestion[]} questions
 */

/**
 * What a scheme is checked against, from the pack's two `.tex` files.
 *
 * @param {string} qbtText
 * @param {string} solnText
 * @returns {Pack}
 */
export function packModel(qbtText, solnText) {
  const header = /\\djsQbtHeader\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(
    qbtText.split(/\r?\n/).map(codePart).join('\n'),
  );
  if (!header) throw new Error("no \\djsQbtHeader{...}: is this a pack's questions file?");
  const sitePath = /\\djsSitePath\{([^{}\r\n]*)\}\{([^{}\r\n]*)\}/.exec(
    qbtText.split(/\r?\n/).map(codePart).join('\n'),
  );

  const qbtDoc = parseDoc(qbtText);
  const solnDoc = parseDoc(solnText);
  const broken = [...validateBlocks(qbtDoc, 'qbt'), ...validateBlocks(solnDoc, 'soln')];
  if (broken.length) {
    const issue = broken[0];
    throw new Error(`the pack is structurally broken (${issue.kind}${issue.n ? ` Q${issue.n}` : ''}): run check-questions`);
  }
  const marks = packMarks(qbtText);
  const solnBlocks = new Map(solnDoc.blocks.map((b) => [b.n, b]));

  const questions = qbtDoc.blocks.map((block) => {
    const statement = statementLines(block).join('\n');
    const solnBlock = solnBlocks.get(block.n);
    let body = [];
    if (solnBlock) {
      const open = solnBlock.lines.findIndex((l, i) => i > 0 && SOLUTION_OPEN_RE.test(l));
      if (open >= 0) {
        const close = findSolutionClose(solnBlock.lines, open);
        body = solnBlock.lines.slice(open + 1, close < 0 ? solnBlock.lines.length : close);
      }
    }
    const { starts, definesOutside } = solutionFigures(body);
    const marked = [];
    body.forEach((line, i) => {
      starts.forEach((start, n) => {
        if (start === i) marked.push(`${/^\s*/.exec(line)[0]}% figure ${n + 1}`);
      });
      marked.push(line);
    });
    const solution = body.join('\n');
    return {
      q: block.n,
      stamp: questionStamp(statement, solution),
      statement,
      solution,
      solutionMarked: marked.join('\n'),
      figures: starts.length,
      definesOutside,
      parts: marks.filter((m) => m.q === block.n).map((m) => ({ part: m.part, marks: m.count })),
    };
  });

  return {
    title: header[1].trim(),
    strand: sitePath ? sitePath[1] : null,
    section: sitePath ? sitePath[2] : null,
    questions,
  };
}

/**
 * Reads a pack from its questions file's path.
 *
 * @param {string} qbtPath
 */
export function readPack(qbtPath) {
  const paths = packPaths(qbtPath);
  if (!existsSync(paths.qbt)) throw new Error(`no questions file at ${normalizePath(paths.qbt)}`);
  if (!existsSync(paths.soln)) throw new Error(`no solutions file at ${normalizePath(paths.soln)}`);
  return { paths, pack: packModel(readFileSync(paths.qbt, 'utf8'), readFileSync(paths.soln, 'utf8')) };
}

/**
 * `pack --json`: what an external drafting tool reads. Paths are relative to
 * the site's root, with forward slashes.
 *
 * @param {Pack} pack
 * @param {{ questions: string, solutions: string, scheme: string, conventions: string }} files
 */
export function packJson(pack, files) {
  return {
    format: FORMAT,
    title: pack.title,
    strand: pack.strand,
    section: pack.section,
    files,
    questions: pack.questions.map((q) => ({
      q: q.q,
      stamp: q.stamp,
      statement: q.statement,
      solution: q.solutionMarked,
      parts: q.parts,
    })),
  };
}

// ---- YAML -------------------------------------------------------------------

const YAML_OPTIONS = { version: '1.2', schema: 'core', uniqueKeys: true, prettyErrors: false };

/**
 * Parses YAML 1.2 (core schema). CRLF is read as LF.
 *
 * @param {string} text
 * @returns {{ value: unknown, errors: { line: number | null, message: string }[] }}
 */
export function parseYaml(text) {
  const lf = text.replace(/\r\n/g, '\n');
  const doc = YAML.parseDocument(lf, YAML_OPTIONS);
  if (doc.errors.length) {
    const lineAt = (offset) => (Number.isInteger(offset) ? lf.slice(0, offset).split('\n').length : null);
    return {
      value: undefined,
      errors: doc.errors.map((e) => ({
        line: lineAt(e.pos?.[0]),
        message: e.message.split('\n')[0],
      })),
    };
  }
  return { value: doc.toJS(), errors: [] };
}

const plainCache = new Map();

/** True where YAML reads `key: <s>` back as the string `s`. */
function plainAllowed(s) {
  if (plainCache.has(s)) return plainCache.get(s);
  let ok = s !== '' && !s.includes('\n') && s.trim() === s && !/[\x00-\x08\x0b-\x1f\x7f]/.test(s);
  if (ok) {
    try {
      const doc = YAML.parseDocument(`k: ${s}\n`, YAML_OPTIONS);
      ok = doc.errors.length === 0 && isDeepStrictEqual(doc.toJS(), { k: s });
    } catch {
      ok = false;
    }
  }
  plainCache.set(s, ok);
  return ok;
}

function literalBlock(lines, key, prefix, indent, value, clip) {
  const body = value.replace(/\n+$/, '');
  const trailing = value.length - body.length;
  const chomp = clip ? '' : trailing === 0 ? '-' : trailing === 1 ? '' : '+';
  const content = body.split('\n');
  const firstText = content.find((line) => line.trim() !== '') ?? '';
  const indicator = /^[ ]/.test(firstText) || content[0] === '' ? '2' : '';
  lines.push(`${prefix}${key}: |${indicator}${chomp}`);
  const pad = `${indent}  `;
  for (const line of content) lines.push(line === '' ? '' : `${pad}${line}`);
  if (!clip) for (let i = 1; i < trailing; i++) lines.push('');
}

function emitMap(type, obj, firstPrefix, restPrefix, lines) {
  let first = true;
  for (const [key, kind] of SCHEMA[type]) {
    const value = obj[key];
    if (value === undefined) continue;
    const prefix = first ? firstPrefix : restPrefix;
    first = false;
    if (kind === 'int') {
      lines.push(`${prefix}${key}: ${value}`);
    } else if (kind === 'block') {
      if (value.replace(/\n+$/, '') === '') lines.push(`${prefix}${key}: ''`);
      else literalBlock(lines, key, prefix, restPrefix, value, true);
    } else if (kind === 'str') {
      if (value.includes('\n')) literalBlock(lines, key, prefix, restPrefix, value, false);
      else if (plainAllowed(value)) lines.push(`${prefix}${key}: ${value}`);
      else lines.push(`${prefix}${key}: '${value.replace(/'/g, "''")}'`);
    } else if (kind[0] === 'seq') {
      if (value.length === 0) {
        lines.push(`${prefix}${key}: []`);
      } else {
        lines.push(`${prefix}${key}:`);
        for (const item of value) emitMap(kind[1], item, `${restPrefix}  - `, `${restPrefix}    `, lines);
      }
    } else {
      lines.push(`${prefix}${key}:`);
      emitMap(kind[1], value, `${restPrefix}  `, `${restPrefix}  `, lines);
    }
  }
  if (first) lines.push(`${firstPrefix}{}`);
}

/** The data as the canonical form reads it back: every `scheme` ends in one newline. */
function normalized(type, obj) {
  const out = {};
  for (const [key, kind] of SCHEMA[type]) {
    const value = obj[key];
    if (value === undefined) continue;
    if (kind === 'block') {
      const body = value.replace(/\n+$/, '');
      out[key] = body === '' ? '' : `${body}\n`;
    } else if (Array.isArray(kind) && kind[0] === 'seq') {
      if (value.length) out[key] = value.map((item) => normalized(kind[1], item));
      else out[key] = [];
    } else if (Array.isArray(kind)) {
      out[key] = normalized(kind[1], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Writes a scheme in canonical form. The data must have passed rule 1's
 * fields and types. Throws if YAML wouldn't read the output back as the data.
 *
 * @param {object} scheme
 * @returns {string} LF line endings, ending in a newline
 */
export function emitScheme(scheme) {
  const problems = writableProblems(scheme);
  if (problems.length) {
    throw new Error(`cannot write the data: ${problems.map((p) => `${p.where}: ${p.message}`).join('; ')}`);
  }
  const lines = [];
  emitMap('file', scheme, '', '', lines);
  const text = `${lines.join('\n')}\n`;
  const back = parseYaml(text);
  if (back.errors.length || !isDeepStrictEqual(back.value, normalized('file', scheme))) {
    throw new Error('the data cannot be written in canonical form (a string YAML cannot hold?)');
  }
  return text;
}

// ---- The checker ------------------------------------------------------------

/**
 * @typedef {Object} Problem
 * @property {number} rule
 * @property {string} where    - `file`, `Q3`, `Q3(b) row 2 mark 1`, ...
 * @property {number | null} q - The question it belongs to, if any
 * @property {string} message
 */

class Report {
  constructor() {
    /** @type {Problem[]} */
    this.errors = [];
    /** @type {Problem[]} */
    this.warnings = [];
  }

  error(rule, where, q, message) {
    this.errors.push({ rule, where, q, message });
  }

  warn(rule, where, q, message) {
    this.warnings.push({ rule, where, q, message });
  }

  result() {
    const order = (a, b) => (a.q ?? 0) - (b.q ?? 0) || a.rule - b.rule;
    return { errors: [...this.errors].sort(order), warnings: [...this.warnings].sort(order) };
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const isStr = (v) => typeof v === 'string';
const oneLine = (v) => isStr(v) && v.trim() !== '' && !v.includes('\n');

function typeName(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a list';
  if (typeof v === 'object') return 'a mapping';
  if (typeof v === 'number') return Number.isInteger(v) ? 'a whole number' : 'a number';
  return `a ${typeof v}`;
}

/** Rule 1: only the known fields, with their types. */
function checkFields(type, obj, where, q, report, { stampOptional = false } = {}) {
  if (!isPlainObject(obj)) {
    report.error(1, where, q, `expected a mapping, found ${typeName(obj)}`);
    return false;
  }
  let ok = true;
  const known = new Set(SCHEMA[type].map(([k]) => k));
  for (const key of Object.keys(obj)) {
    if (known.has(key)) continue;
    ok = false;
    report.error(1, where, q, NOT_YET[key] ? `\`${key}\`: ${NOT_YET[key]}` : `unknown field \`${key}\``);
  }
  for (const key of REQUIRED[type]) {
    if (key === 'stamp' && stampOptional) continue;
    if (obj[key] === undefined) {
      ok = false;
      report.error(1, where, q, `missing \`${key}\``);
    }
  }
  for (const [key, kind] of SCHEMA[type]) {
    const value = obj[key];
    if (value === undefined) continue;
    let good;
    let wanted;
    if (kind === 'int') {
      good = isInt(value) && value >= (key === 'format' ? 0 : 1);
      wanted = key === 'format' ? 'a whole number' : 'a whole number from 1';
    } else if (kind === 'str' || kind === 'block') {
      good = isStr(value);
      wanted = 'a string';
    } else if (kind[0] === 'seq') {
      good = Array.isArray(value);
      wanted = 'a list';
    } else {
      good = isPlainObject(value);
      wanted = 'a mapping';
    }
    if (!good) {
      ok = false;
      report.error(1, where, q, `\`${key}\` must be ${wanted}, not ${typeName(value)}`);
      continue;
    }
    if (Array.isArray(kind) && kind[0] === 'seq') {
      value.forEach((item, i) => {
        const childWhere = childLocation(kind[1], item, where, i, q);
        if (!checkFields(kind[1], item, childWhere, kind[1] === 'question' ? item?.q ?? q : q, report, { stampOptional })) ok = false;
      });
    } else if (Array.isArray(kind)) {
      if (!checkFields(kind[1], value, `${where} ${key}`, q, report)) ok = false;
    }
  }
  if (type === 'file' && isInt(obj.format) && obj.format !== FORMAT) {
    ok = false;
    report.error(1, where, q, `\`format\` must be ${FORMAT}`);
  }
  if (type === 'question' && isStr(obj.stamp) && !/^[0-9a-f]{8}$/.test(obj.stamp)) {
    ok = false;
    report.error(1, where, q, '`stamp` must be 8 lowercase hex characters');
  }
  if (type === 'alt' && obj.title !== undefined && isStr(obj.title) && !oneLine(obj.title)) {
    ok = false;
    report.error(1, where, q, "the alternative's `title` must be a few words on one line");
  }
  if (type === 'part' && obj.rows === undefined && obj.flag === undefined) {
    ok = false;
    report.error(1, where, q, 'a part needs `rows`, or a `flag` in a draft');
  }
  return ok;
}

function childLocation(type, item, where, i, q) {
  if (type === 'question') return isPlainObject(item) && isInt(item.q) ? `Q${item.q}` : `question ${i + 1}`;
  if (type === 'part') {
    return isPlainObject(item) && isStr(item.part) ? partLabel(q, item.part) : `${where} part ${i + 1}`;
  }
  if (type === 'row') return `${where.replace(/ rows$/, '')} row ${i + 1}`;
  if (type === 'mark') return `${where.replace(/ marks$/, '')} mark ${i + 1}`;
  return `${where} ${i + 1}`;
}

/** Every string in the data, with where it is. */
function* strings(value, where) {
  if (isStr(value)) {
    yield [value, where];
  } else if (Array.isArray(value)) {
    for (const item of value) yield* strings(item, where);
  } else if (isPlainObject(value)) {
    for (const item of Object.values(value)) yield* strings(item, where);
  }
}

const CONTROL_HINTS = {
  '\t': '\\t (\\theta, \\text, \\times, \\tfrac?)',
  '\f': '\\f (\\frac?)',
  '\b': '\\b (\\beta, \\binom, \\bar?)',
  '\r': '\\r (\\right, \\rho?)',
};
const NEWLINE_MACRO_RE =
  /\n(?:eq|e|abla|ot|otin|ewline|u|eg|i|mid|exists|leq|geq|oindent|ormalsize|onumber|olimits|ewcommand|earrow|warrow|parallel|subseteq)(?![A-Za-z])/;

/** Text outside maths, with LaTeX command names removed. */
function proseOf(text) {
  return text
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\\\([\s\S]*?\\\)/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/(?<!\\)\$[\s\S]*?(?<!\\)\$/g, ' ')
    .replace(/\\begin\{(align|equation|gather|multline)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
    .replace(/\\[A-Za-z]+/g, ' ');
}

function wordCount(text) {
  const words = text
    .replace(/\\\[[\s\S]*?\\\]/g, ' x ')
    .replace(/\\\([\s\S]*?\\\)/g, ' x ')
    .replace(/(?<!\\)\$[\s\S]*?(?<!\\)\$/g, ' x ')
    .trim()
    .split(/\s+/);
  return words[0] === '' ? 0 : words.length;
}

/** Why `code` is not a mark code (rule 10), or null. */
export function codeProblem(code) {
  if (CODES.includes(code)) return null;
  const words = code.trim().split(/\s+/);
  const house = {
    'A1*': 'A1* is written `A1 AG`: AG qualifies the A1',
    AG: 'a lone AG: AG qualifies the A1 before it, as `A1 AG`, one mark',
    B2: 'B2 is two marks: write `B1` twice, each with what earns it',
    M2: 'M2 is two marks: write `M1` and then `dM1` (or `M1`), each with what earns it',
    R1: 'R1 is written `E1`: a mark for a reason or a conclusion',
    DM1: 'DM1 is written `dM1`',
    A0: 'A0 is not a mark: leave it out, and say in a note what scores nothing',
  };
  if (house[code]) return house[code];
  if (words.length === 2 && words[0] === 'A1' && words[1] === 'AG') return `write ${JSON.stringify(code)} as \`A1 AG\``;
  if (words[words.length - 1] === 'AG' && words.length > 1) {
    return `AG after ${words.slice(0, -1).join(' ')}: AG qualifies only A1, as \`A1 AG\``;
  }
  return `${JSON.stringify(code)} is not a mark code (use ${CODES.join(', ')})`;
}

/** The marks of a method (a part's main rows, or its alternative's), in order. */
function methodMarks(rows) {
  const out = [];
  if (!Array.isArray(rows)) return out;
  rows.forEach((row, r) => {
    if (!isPlainObject(row) || !Array.isArray(row.marks)) return;
    row.marks.forEach((mark, m) => {
      if (isPlainObject(mark)) out.push({ mark, row, r, m });
    });
  });
  return out;
}

/**
 * Rules 5-23 on one question, beside its pack question.
 *
 * @param {object} question
 * @param {PackQuestion | null} packQ
 * @param {Report} report
 * @param {{ modelAnswer?: boolean, codes?: Map<string, { codes: string[], alt: string[] | null }> | null }} opts
 */
function checkQuestionBody(question, packQ, report, { modelAnswer = false, codes = null } = {}) {
  const q = isInt(question.q) ? question.q : null;
  const parts = Array.isArray(question.parts) ? question.parts : [];
  const packParts = new Map();
  if (packQ) {
    const seen = new Map();
    for (const p of packQ.parts) seen.set(p.part, (seen.get(p.part) ?? 0) + 1);
    for (const p of packQ.parts) if (seen.get(p.part) === 1) packParts.set(p.part, p);
  }
  const partsByLabel = new Map();
  parts.forEach((p, i) => {
    if (isPlainObject(p) && isStr(p.part) && !partsByLabel.has(p.part)) partsByLabel.set(p.part, { p, i });
  });

  parts.forEach((part, partIndex) => {
    if (!isPlainObject(part)) return;
    const label = isStr(part.part) ? part.part : null;
    const where = label !== null ? partLabel(q ?? '?', label) : `Q${q ?? '?'} part ${partIndex + 1}`;
    const packPart = label !== null ? packParts.get(label) : undefined;

    // Rule 23: flags.
    if (part.flag !== undefined) {
      const flag = part.flag;
      if (isPlainObject(flag)) {
        if (isStr(flag.kind)) {
          if (flag.kind === 'validation') {
            report.error(23, where, q, 'the `validation` flag is not in this version');
          } else if (flag.kind === 'breakdown') {
            report.error(23, where, q, 'there is no `breakdown` flag: draft the part and add a `query` to the mark');
          } else if (!FLAG_KINDS.includes(flag.kind)) {
            report.error(23, where, q, `unknown flag kind \`${flag.kind}\` (use ${FLAG_KINDS.join(', ')})`);
          } else if (modelAnswer && !MODEL_FLAG_KINDS.has(flag.kind)) {
            report.error(23, where, q, '`not_drafted` is written by an external drafting tool, never in an answer');
          }
        }
        if (flag.why !== undefined && !oneLine(flag.why)) report.error(23, where, q, "a flag's `why` is one line");
      }
      if (part.rows !== undefined || part.alt !== undefined) {
        report.error(23, where, q, 'a flagged part has no `rows` or `alt`: the flag replaces them');
      }
      return;
    }

    const methods = [['', part.rows, null]];
    if (isPlainObject(part.alt)) methods.push(['alt ', part.alt.rows, part.alt]);

    for (const [prefix, rows, alt] of methods) {
      if (!Array.isArray(rows)) continue;
      const methodWhere = (r, m) =>
        `${where} ${prefix}row ${r + 1}${m === undefined ? '' : ` mark ${m + 1}`}`;

      rows.forEach((row, r) => {
        if (!isPlainObject(row)) return;
        const rowWhere = methodWhere(r);
        const marks = Array.isArray(row.marks) ? row.marks : [];
        const hasScheme = row.scheme !== undefined;
        const hasFigure = row.figure !== undefined;
        // Rule 5.
        if (hasScheme && hasFigure) report.error(5, rowWhere, q, 'a row has `scheme` or `figure`, not both');
        if (!hasScheme && !hasFigure) report.error(5, rowWhere, q, 'a row needs `scheme` or `figure`');
        if (hasScheme && !hasFigure && marks.length > 2) {
          report.error(5, rowWhere, q, `a Scheme row carries at most two marks, not ${marks.length}`);
        }
        // Rule 7: Scheme lines.
        if (isStr(row.scheme)) {
          const lines = row.scheme.replace(/\n+$/, '').split('\n');
          lines.forEach((line, i) => {
            const at = lines.length > 1 ? ` (line ${i + 1})` : '';
            if (line.trim() === '') report.error(7, rowWhere, q, `an empty Scheme line${at}`);
            if (/\\\\(\[[^\]]*\])?\s*$/.test(line)) {
              report.error(7, rowWhere, q, `\\\\ ends a Scheme line${at}: each line is already a line of the cell`);
            }
            if (isPlaceholder(line)) report.error(7, rowWhere, q, `a placeholder in the Scheme column${at}`);
          });
        }
        // Rule 20, 21: figures.
        if (isInt(row.figure) && packQ) {
          if (row.figure > packQ.figures) {
            report.error(
              20,
              rowWhere,
              q,
              packQ.figures === 0
                ? `\`figure: ${row.figure}\`: the solution has no picture to reuse`
                : `\`figure: ${row.figure}\`: the solution has ${packQ.figures} picture${packQ.figures === 1 ? '' : 's'}`,
            );
          }
          if (packQ.definesOutside) {
            report.warn(
              21,
              rowWhere,
              q,
              'the solution box defines something outside its pictures (\\def, \\pgfmathsetmacro, \\newcommand): a picture copied alone may not compile',
            );
          }
        }
        // Rule 13: figure marks.
        marks.forEach((mark, m) => {
          if (!isPlainObject(mark)) return;
          const markWhere = methodWhere(r, m);
          if (hasFigure && !hasScheme) {
            if (isStr(mark.code) && !FIGURE_CODES.has(mark.code)) {
              report.error(13, markWhere, q, `a figure row's marks are B1 or B1ft, not ${mark.code}`);
            }
            if (mark.feature === undefined) {
              report.error(13, markWhere, q, `a figure mark names its \`feature\` (${FEATURES.join(', ')})`);
            } else if (isStr(mark.feature) && !FEATURES.includes(mark.feature)) {
              report.error(13, markWhere, q, `unknown feature \`${mark.feature}\` (use ${FEATURES.join(', ')})`);
            }
          } else if (mark.feature !== undefined) {
            report.error(13, markWhere, q, 'only a figure row\'s marks have a `feature`');
          }
        });
      });

      const list = methodMarks(rows);
      // Rule 8, 9: totals.
      if (packPart) {
        if (list.length !== packPart.marks) {
          report.error(
            alt ? 9 : 8,
            alt ? `${where} alt` : where,
            q,
            `${alt ? "the alternative's" : 'its'} marks number ${list.length}; the part is worth ${packPart.marks}`,
          );
        }
      }

      // Rules 10, 11, 12, 15, 18, 19 and the notes of 7, mark by mark.
      let lastMethod = -1;
      let seenGiven = false;
      list.forEach(({ mark, r, m }, k) => {
        const markWhere = methodWhere(r, m);
        const code = isStr(mark.code) ? mark.code : null;
        if (code !== null) {
          const problem = codeProblem(code);
          if (problem) report.error(10, markWhere, q, problem);
        }
        // Rule 11.
        if (code === 'dM1' && lastMethod < 0 && mark.depends_on === undefined) {
          report.error(11, markWhere, q, 'a dM1 needs an M1 or dM1 before it in the method, or a `depends_on`');
        }
        if (code !== null && A_CODES.has(code)) {
          if (lastMethod < 0) report.error(11, markWhere, q, `${code} needs an M1 or dM1 before it in the method`);
          if (seenGiven) report.error(11, markWhere, q, `${code} after A1 AG: A1 AG is the method's last A mark`);
          if (code === GIVEN) seenGiven = true;
        }
        // Rule 12.
        if (mark.depends_on !== undefined) {
          if (code !== 'dM1') {
            report.error(12, markWhere, q, '`depends_on` is only on a dM1');
          } else if (isStr(mark.depends_on)) {
            const problem = dependsProblem(mark.depends_on, k, lastMethod, list, label, partIndex, partsByLabel, alt);
            if (problem) report.error(12, markWhere, q, problem);
          }
          if (!isStr(mark.note) || mark.note.trim() === '') {
            report.error(12, markWhere, q, 'a mark with `depends_on` has a note saying what it depends on');
          }
        }
        // Rule 15.
        if (code !== null && NOTE_REQUIRED.has(code) && mark.note === undefined) {
          report.error(15, markWhere, q, `${code} needs a note`);
        }
        if (isStr(mark.note)) {
          // Rule 7.
          if (mark.note.trim() === '') report.error(7, markWhere, q, 'an empty note');
          else if (isPlaceholder(mark.note)) report.error(7, markWhere, q, 'a placeholder in the note');
          // Rule 18.
          if (code !== null && VERB_NOTE.has(code) && mark.note.trim() !== '') {
            const firstWord = /^[A-Za-z]+/.exec(mark.note.trim())?.[0];
            if (!firstWord || !NOTE_VERBS.has(firstWord)) {
              report.warn(18, markWhere, q, `${code} note opens with a verb ("Uses", "Forms", "Obtains", ...), not ${JSON.stringify(mark.note.trim().split(/\s+/)[0])}`);
            }
          }
          // Rule 19.
          const words = wordCount(mark.note);
          if (words > NOTE_WORD_LIMIT) report.warn(19, markWhere, q, `a note of ${words} words (aim for 20-25)`);
        }
        // Rule 23: queries.
        if (isPlainObject(mark.query)) {
          const query = mark.query;
          if (isStr(query.code)) {
            const problem = codeProblem(query.code);
            if (problem) report.error(23, markWhere, q, `the query's code: ${problem}`);
            else if (query.code === code) report.error(23, markWhere, q, "a query's code differs from its mark's");
          }
          if (query.why !== undefined && !oneLine(query.why)) report.error(23, markWhere, q, "a query's `why` is one line");
        }
        if (code !== null && METHOD_CODES.has(code)) lastMethod = k;
      });
    }

    // Rule 14: the codes given.
    if (codes && label !== null) {
      const given = codes.get(label);
      if (!given) {
        report.error(14, where, q, 'no codes were given for this part');
      } else {
        const main = methodMarks(part.rows).map((x) => x.mark.code);
        if (!isDeepStrictEqual(main, given.codes)) {
          report.error(14, where, q, `its codes are ${main.join(' ') || 'none'}; the codes given are ${given.codes.join(' ')}`);
        }
        const altCodes = isPlainObject(part.alt) ? methodMarks(part.alt.rows).map((x) => x.mark.code) : null;
        if (altCodes && !given.alt) {
          report.error(14, `${where} alt`, q, 'an alternative, but no codes were given for one');
        } else if (!altCodes && given.alt) {
          report.error(14, where, q, `codes were given for an alternative (${given.alt.join(' ')}), but there is none`);
        } else if (altCodes && !isDeepStrictEqual(altCodes, given.alt)) {
          report.error(14, `${where} alt`, q, `its codes are ${altCodes.join(' ') || 'none'}; the codes given are ${given.alt.join(' ')}`);
        }
      }
    }
  });

  // Rules 6, 7 (titles and whys, upright i and e, and straight quotes) and 16 over the question's text.
  for (const [text, field] of questionTexts(question)) {
    const where = field.where;
    for (const [ch, hint] of Object.entries(CONTROL_HINTS)) {
      if (text.includes(ch)) {
        report.error(6, where, q, `a ${JSON.stringify(ch).slice(1, -1)} character in the ${field.name}: ${hint} written with one backslash`);
      }
    }
    if (NEWLINE_MACRO_RE.test(text) && field.name !== 'Scheme column') {
      report.warn(6, where, q, `a line break in the ${field.name} followed by the rest of a macro (\\neq, \\nabla, \\not?)`);
    } else if (field.name === 'Scheme column' && NEWLINE_MACRO_RE.test(text.replace(/\n$/, ''))) {
      report.warn(6, where, q, 'a Scheme line starts like the rest of a macro beginning \\n (\\neq, \\nabla, \\not?): check the line break is meant');
    }
    if ((field.name === 'title' || field.name === 'why') && isPlaceholder(text)) {
      report.error(7, where, q, `a placeholder in the ${field.name}`);
    }
    for (const letter of new Set(Array.from(text.matchAll(UPRIGHT_LETTER_RE), (m) => m[1]))) {
      report.error(7, where, q, `\\mathrm{${letter}} in the ${field.name}: write ${UPRIGHT_LETTERS[letter]} as a plain ${letter}`);
    }
    if (text.includes('"')) {
      report.error(7, where, q, `a straight " in the ${field.name}, which prints as a closing quote: write their value as \\their{...} and quoted words as \`\`...''`);
    }
    if (PROSE_FIELDS.has(field.name)) {
      const prose = proseOf(text);
      for (const word of BANNED_ABBREVIATIONS) {
        if (new RegExp(`(?<![A-Za-z])${word}(?![A-Za-z])`, 'i').test(prose)) {
          report.error(16, where, q, `"${word}" in the ${field.name}: write what it means in words`);
        }
      }
      const banned = new Set(BANNED_ABBREVIATIONS.map((w) => w.toUpperCase()));
      for (const m of prose.matchAll(/(?<![A-Za-z0-9])[A-Z]{2,5}(?![A-Za-z0-9])/g)) {
        if (ALLOWED_CAPITALS.has(m[0]) || banned.has(m[0])) continue;
        report.warn(16, where, q, `"${m[0]}" in the ${field.name}: an abbreviation the conventions pages don't define?`);
      }
    }
  }
}

const PROSE_FIELDS = new Set(['note', 'Scheme column', 'title']);

/** The letters the packs write italic, as plain i and e, which a scheme writes the same way. */
const UPRIGHT_LETTERS = { i: 'the imaginary unit', e: 'the exponential' };
const UPRIGHT_LETTER_RE = /\\mathrm\s*\{\s*([ie])\s*\}/g;

function isPlaceholder(text) {
  const t = text.trim();
  return /(?<![A-Za-z])(TODO|TBC)(?![A-Za-z])/.test(t) || t === '...' || t === '…' || t === '?';
}

/** The question's strings that are shown or reviewed, with where each is. */
function* questionTexts(question) {
  const q = isInt(question.q) ? question.q : '?';
  const parts = Array.isArray(question.parts) ? question.parts : [];
  for (const [i, part] of parts.entries()) {
    if (!isPlainObject(part)) continue;
    const where = isStr(part.part) ? partLabel(q, part.part) : `Q${q} part ${i + 1}`;
    if (isPlainObject(part.flag) && isStr(part.flag.why)) yield [part.flag.why, { where: `${where} flag`, name: 'why' }];
    const methods = [['', part.rows]];
    if (isPlainObject(part.alt)) {
      if (isStr(part.alt.title)) yield [part.alt.title, { where: `${where} alt`, name: 'title' }];
      methods.push(['alt ', part.alt.rows]);
    }
    for (const [prefix, rows] of methods) {
      if (!Array.isArray(rows)) continue;
      for (const [r, row] of rows.entries()) {
        if (!isPlainObject(row)) continue;
        const rowWhere = `${where} ${prefix}row ${r + 1}`;
        if (isStr(row.scheme)) yield [row.scheme, { where: rowWhere, name: 'Scheme column' }];
        if (!Array.isArray(row.marks)) continue;
        for (const [m, mark] of row.marks.entries()) {
          if (!isPlainObject(mark)) continue;
          const markWhere = `${rowWhere} mark ${m + 1}`;
          if (isStr(mark.note)) yield [mark.note, { where: markWhere, name: 'note' }];
          if (isPlainObject(mark.query) && isStr(mark.query.why)) {
            yield [mark.query.why, { where: `${markWhere} query`, name: 'why' }];
          }
          for (const [key, value] of [['code', mark.code], ['feature', mark.feature], ['depends_on', mark.depends_on]]) {
            if (isStr(value) && /[\t\f\b\r]/.test(value)) yield [value, { where: markWhere, name: key }];
          }
        }
      }
    }
  }
}

/** Why a dM1's `depends_on` is wrong (rule 12), or null. */
function dependsProblem(ref, k, lastMethod, list, label, partIndex, partsByLabel, alt) {
  const own = /^(\d+)$/.exec(ref);
  const other = /^(.*):(\d+)$/.exec(ref);
  if (own) {
    const n = Number(own[1]);
    if (n < 1 || n > k) return `\`depends_on: "${ref}"\` names no mark before this one in the method`;
    const target = list[n - 1].mark.code;
    if (!METHOD_CODES.has(target)) return `\`depends_on: "${ref}"\` names a ${target}, not an M1 or dM1`;
    if (n - 1 === lastMethod) return `\`depends_on: "${ref}"\` is the default (the method mark before it): leave it out`;
    return null;
  }
  if (other) {
    const [, otherLabel, nText] = other;
    if (otherLabel === label) return `\`depends_on: "${ref}"\` names this part: write "${nText}"`;
    const found = partsByLabel.get(otherLabel);
    if (!found || found.i >= partIndex) return `\`depends_on: "${ref}"\`: no part \`${otherLabel}\` before this one`;
    if (found.p.flag !== undefined) return null;
    const marks = methodMarks(found.p.rows);
    const n = Number(nText);
    if (n < 1 || n > marks.length) return `\`depends_on: "${ref}"\`: part \`${otherLabel}\` has no mark ${n}`;
    const target = marks[n - 1].mark.code;
    if (!METHOD_CODES.has(target)) return `\`depends_on: "${ref}"\` names a ${target}, not an M1 or dM1`;
    return null;
  }
  return `\`depends_on\` is "N" (a mark of this method) or "<part>:N", not ${JSON.stringify(ref)}`;
}

/** Rule 4 for one question: its parts are the pack question's, in order. */
function checkParts(question, packQ, report) {
  const q = question.q;
  const parts = Array.isArray(question.parts) ? question.parts : [];
  const labels = parts.map((p) => (isPlainObject(p) && isStr(p.part) ? p.part : null));
  const expected = packQ.parts.map((p) => p.part);
  if (!isDeepStrictEqual(labels, expected)) {
    const show = (list) => (list.length ? list.map((p) => (p === null ? '?' : JSON.stringify(p))).join(', ') : 'none');
    report.error(4, `Q${q}`, q, `its parts are ${show(labels)}; the pack's \\marks are ${show(expected)}, in that order`);
  }
}

function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function packDate(value) {
  const [day, month, year] = value.split(' ');
  return new Date(Number(year), MONTHS.indexOf(month), Number(day));
}

/**
 * Rules 1-24 on a scheme file.
 *
 * @param {string} text - The YAML, as read
 * @param {Pack} pack
 * @param {{ today?: Date, draft?: boolean }} [opts] - `draft` leaves out rule 24
 * @returns {{ errors: Problem[], warnings: Problem[], scheme?: object }}
 */
export function checkScheme(text, pack, { today: now = today(), draft = false } = {}) {
  const report = new Report();
  const parsed = parseYaml(text);
  if (parsed.errors.length) {
    for (const e of parsed.errors) {
      report.error(1, e.line ? `line ${e.line}` : 'file', null, `does not parse: ${e.message}`);
    }
    return report.result();
  }
  const scheme = parsed.value;
  const fieldsOk = checkFields('file', scheme, 'file', null, report);
  if (!isPlainObject(scheme)) return report.result();

  // Rule 1: canonical form.
  if (fieldsOk) {
    let canonical = null;
    try {
      canonical = emitScheme(scheme);
    } catch (e) {
      report.error(1, 'file', null, e.message);
    }
    const lf = text.replace(/\r\n/g, '\n');
    if (canonical !== null && canonical !== lf) {
      const a = lf.split('\n');
      const b = canonical.split('\n');
      let line = 0;
      while (line < a.length && a[line] === b[line]) line++;
      report.error(1, `line ${line + 1}`, null, 'not in canonical form: run `npm run markscheme -- format <yaml>`');
    }
  }

  // Rule 2.
  if (isStr(scheme.pack) && scheme.pack !== pack.title) {
    report.error(2, 'file', null, `\`pack\` is ${JSON.stringify(scheme.pack)}; the questions file's title is ${JSON.stringify(pack.title)}`);
  }
  // Rule 3.
  if (isStr(scheme.last_updated)) {
    if (!isValidPackDate(scheme.last_updated)) {
      report.error(3, 'file', null, `\`last_updated\` is written like "20 October 2026", not ${JSON.stringify(scheme.last_updated)}`);
    } else if (packDate(scheme.last_updated) > now) {
      report.error(3, 'file', null, `\`last_updated\` (${scheme.last_updated}) is after today`);
    }
  }

  // Rule 4: the questions.
  const questions = Array.isArray(scheme.questions) ? scheme.questions : [];
  if (questions.length !== pack.questions.length) {
    report.error(4, 'file', null, `${questions.length} question${questions.length === 1 ? '' : 's'}; the pack has ${pack.questions.length}`);
  }
  questions.forEach((question, i) => {
    if (!isPlainObject(question)) return;
    const packQ = pack.questions[i] ?? null;
    if (isInt(question.q) && question.q !== i + 1) {
      report.error(4, `Q${question.q}`, question.q, `question ${i + 1} of the scheme has \`q: ${question.q}\`: questions are numbered 1, 2, ... in order`);
    }
    const matched = packQ && question.q === packQ.q ? packQ : null;
    if (matched) checkParts(question, matched, report);
    checkQuestionBody(question, matched, report);
  });

  // Rule 24.
  if (!draft) {
    questions.forEach((question) => {
      if (!isPlainObject(question)) return;
      const q = isInt(question.q) ? question.q : null;
      for (const part of Array.isArray(question.parts) ? question.parts : []) {
        if (!isPlainObject(part)) continue;
        const where = isStr(part.part) ? partLabel(q ?? '?', part.part) : `Q${q ?? '?'}`;
        if (part.flag !== undefined) report.error(24, where, q, 'a committed scheme holds no flag: settle it first');
        const rows = [...(Array.isArray(part.rows) ? part.rows : []), ...(isPlainObject(part.alt) && Array.isArray(part.alt.rows) ? part.alt.rows : [])];
        for (const { mark } of methodMarks(rows)) {
          if (mark.query !== undefined) report.error(24, where, q, `a committed scheme holds no query (${mark.code} -> ${mark.query?.code}): settle it first`);
        }
      }
    });
  }
  return { ...report.result(), scheme };
}

/**
 * Reads a codes file for rule 14: `{ "parts": [{ "q": 3, "part": "a",
 * "codes": ["M1", "A1"], "alt": [...] }] }`, a bare list of those, or
 * `{ "questions": [{ "q": 3, "parts": [{ "part": "a", "codes": [...] }] }] }`.
 * A code may be a string or an object with a `code`.
 *
 * @param {unknown} data
 * @returns {Map<number, Map<string, { codes: string[], alt: string[] | null }>>}
 */
export function parseCodes(data) {
  const out = new Map();
  const codeList = (list, where) => {
    if (!Array.isArray(list)) throw new Error(`${where}: codes must be a list`);
    return list.map((c) => {
      const code = isStr(c) ? c : isPlainObject(c) && isStr(c.code) ? c.code : null;
      if (code === null) throw new Error(`${where}: ${JSON.stringify(c)} is not a code`);
      return code;
    });
  };
  const add = (q, part) => {
    if (!isInt(q) || !isPlainObject(part) || !isStr(part.part)) {
      throw new Error(`codes: each part needs its question and its label (${JSON.stringify(part)})`);
    }
    const where = partLabel(q, part.part);
    if (!out.has(q)) out.set(q, new Map());
    out.get(q).set(part.part, {
      codes: codeList(part.codes, where),
      alt: part.alt === undefined || part.alt === null ? null : codeList(part.alt, `${where} alt`),
    });
  };
  if (isPlainObject(data) && Array.isArray(data.questions)) {
    for (const question of data.questions) {
      for (const part of isPlainObject(question) && Array.isArray(question.parts) ? question.parts : []) add(question.q, part);
    }
  } else {
    const parts = Array.isArray(data) ? data : isPlainObject(data) && Array.isArray(data.parts) ? data.parts : null;
    if (!parts) throw new Error('codes: expected `parts` or `questions`');
    for (const part of parts) add(isPlainObject(part) ? part.q : null, part);
  }
  return out;
}

/**
 * The accept's check of one drafted question: rule 1's fields and types,
 * then rules 4-23 (rule 14 when codes are given). Its `stamp` may be absent.
 *
 * @param {unknown} question
 * @param {Pack} pack
 * @param {{ codes?: ReturnType<typeof parseCodes> | null }} [opts]
 * @returns {{ errors: Problem[], warnings: Problem[] }}
 */
export function checkQuestion(question, pack, { codes = null } = {}) {
  const report = new Report();
  const q = isPlainObject(question) && isInt(question.q) ? question.q : null;
  checkFields('question', question, q ? `Q${q}` : 'question', q, report, { stampOptional: true });
  if (!isPlainObject(question)) return report.result();
  const packQ = q !== null ? pack.questions.find((p) => p.q === q) ?? null : null;
  if (q !== null && !packQ) report.error(4, `Q${q}`, q, `the pack has no question ${q}`);
  if (packQ) checkParts(question, packQ, report);
  checkQuestionBody(question, packQ, report, {
    modelAnswer: true,
    codes: codes && q !== null ? codes.get(q) ?? new Map() : null,
  });
  return report.result();
}

/**
 * The structure an emitter needs (rule 1's fields and types, and no control
 * character a YAML string can't hold), as problems.
 *
 * @param {unknown} scheme
 */
export function writableProblems(scheme) {
  const report = new Report();
  checkFields('file', scheme, 'file', null, report);
  for (const [text, where] of strings(scheme, 'file')) {
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text.replace(/\t/g, ''))) {
      report.error(6, where, null, `a control character in ${JSON.stringify(text.slice(0, 40))}`);
    }
  }
  return report.result().errors;
}

// ---- Edits: splice, stamp, renumber ----------------------------------------

/**
 * Question numbers from `"3, 5"` (or `"3 5"`).
 *
 * @param {string} text
 * @returns {number[]}
 */
export function parseOnly(text) {
  const items = String(text).split(/[\s,]+/).filter(Boolean);
  if (!items.length) throw new Error('--only names no question');
  const out = [];
  for (const item of items) {
    if (!/^[1-9]\d*$/.test(item)) throw new Error(`--only: ${JSON.stringify(item)} is not a question number`);
    const n = Number(item);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Replaces (or adds, in order) the questions `only` names in `target` with
 * those in `source`. Every other question is left as it is.
 *
 * @param {object} target - A scheme
 * @param {object[]} sourceQuestions
 * @param {number[]} only
 */
export function spliceQuestions(target, sourceQuestions, only) {
  const byQ = new Map(sourceQuestions.filter(isPlainObject).map((q) => [q.q, q]));
  const questions = [...target.questions];
  for (const n of only) {
    const incoming = byQ.get(n);
    if (!incoming) throw new Error(`the JSON has no question ${n}`);
    const at = questions.findIndex((q) => q.q === n);
    if (at >= 0) questions[at] = incoming;
    else {
      const after = questions.findIndex((q) => q.q > n);
      questions.splice(after < 0 ? questions.length : after, 0, incoming);
    }
  }
  return { ...target, questions };
}

/**
 * Sets the `stamp` of the questions `only` names to the pack's now.
 *
 * @param {object} scheme
 * @param {Pack} pack
 * @param {number[]} only
 */
export function stampQuestions(scheme, pack, only) {
  for (const n of only) {
    if (!scheme.questions.some((q) => q.q === n)) throw new Error(`the scheme has no question ${n}`);
    if (!pack.questions.some((p) => p.q === n)) throw new Error(`the pack has no question ${n}`);
  }
  const questions = scheme.questions.map((question) => {
    if (!only.includes(question.q)) return question;
    const packQ = pack.questions.find((p) => p.q === question.q);
    return { ...question, stamp: packQ.stamp };
  });
  return { ...scheme, questions };
}

/**
 * After a pack's questions are reordered: matches each of the scheme's
 * questions to the pack's by stamp, puts them in the pack's order and sets
 * each `q` to its new number. Throws, naming the question, when a stamp
 * matches none or more than one of the pack's questions.
 *
 * @param {object} scheme
 * @param {Pack} pack
 */
export function renumberScheme(scheme, pack) {
  const problems = [];
  const placed = scheme.questions.map((question) => {
    const matches = pack.questions.filter((p) => p.stamp === question.stamp);
    if (matches.length === 0) {
      problems.push(`Q${question.q} (stamp ${question.stamp}) matches no question of the pack: revise its scheme first`);
    } else if (matches.length > 1) {
      problems.push(`Q${question.q} (stamp ${question.stamp}) matches questions ${matches.map((m) => m.q).join(' and ')} of the pack`);
    }
    return { question, to: matches.length === 1 ? matches[0].q : null };
  });
  const targets = new Map();
  for (const { question, to } of placed) {
    if (to === null) continue;
    if (targets.has(to)) problems.push(`Q${targets.get(to)} and Q${question.q} both match question ${to} of the pack`);
    else targets.set(to, question.q);
  }
  if (problems.length) throw new Error(problems.join('\n'));
  const questions = placed
    .map(({ question, to }) => ({ ...question, q: to }))
    .sort((a, b) => a.q - b.q);
  return { scheme: { ...scheme, questions }, moves: placed.filter((p) => p.question.q !== p.to).map((p) => [p.question.q, p.to]) };
}

/**
 * Per question, whether it is broken (an error of rules 1-24) or stale (its
 * stamp no longer matches its statement and solution).
 *
 * @param {string} text
 * @param {Pack} pack
 * @param {{ today?: Date }} [opts]
 */
export function schemeStatus(text, pack, opts = {}) {
  const result = checkScheme(text, pack, opts);
  const fileErrors = result.errors.filter((e) => e.q === null);
  const broken = [...new Set(result.errors.filter((e) => e.q !== null).map((e) => e.q))].sort((a, b) => a - b);
  const stale = staleQuestions(result.scheme, pack).map((s) => s.q);
  return { fileErrors, broken, stale, errors: result.errors };
}

/**
 * The questions whose stamp no longer matches their statement and solution
 * (rule 27), each with the stamp it has and the one the pack gives now.
 *
 * @param {unknown} scheme - A parsed scheme, as `checkScheme` returns it
 * @param {Pack} pack
 * @returns {{ q: number, stamp: unknown, now: string }[]}
 */
export function staleQuestions(scheme, pack) {
  const questions = isPlainObject(scheme) && Array.isArray(scheme.questions) ? scheme.questions : [];
  const stale = [];
  for (const question of questions) {
    if (!isPlainObject(question) || !isInt(question.q)) continue;
    const packQ = pack.questions.find((p) => p.q === question.q);
    if (packQ && question.stamp !== packQ.stamp) stale.push({ q: question.q, stamp: question.stamp, now: packQ.stamp });
  }
  return stale;
}
