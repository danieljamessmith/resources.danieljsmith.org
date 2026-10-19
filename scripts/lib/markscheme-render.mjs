/**
 * The mark scheme's pages: a scheme's YAML and its pack, rendered to the
 * scheme's `.tex`. The output depends on nothing else (no date, no path
 * but the shared folder's), so a render can be compared byte for byte.
 *
 * The document, on the scheme preamble (`_shared/markscheme_preamble.tex`):
 *
 * - the front page: the packs' contents-page heading, its counts set here
 *   (`\djsSetQuestionCount`, `\djsAddMarks`) since a scheme has no
 *   `\questionitem` or `\marks`, then the contents table, each question
 *   linked to its first page; the colophon from `\djsLastUpdated`;
 * - the conventions pages, `\input` from `_shared/markscheme_conventions.tex`,
 *   so the questions start on page 4;
 * - a page per question: one long table, Question | Scheme | Marks | Notes.
 *   A part may break between rows: its label sits in its first row, with
 *   no rule across the Question column inside the part, and its total row
 *   is kept with its last row.
 *
 * `draft` also shows what review needs: a queried mark's code as
 * `B1 → E1?` with the query's why under its note, and a flag in its part's
 * place. The committed `.tex` is never a draft.
 */

import { solutionFigures, solutionPictures } from './markscheme.mjs';

/** The shared folder, from a scheme's `.tex` at `<strand>/<section>/ms/`. */
export const SHARED_DIR = '../../../../_shared';

const FLAG_TITLES = {
  solution_error: 'Solution error',
  figure_missing: 'Figure missing',
  not_drafted: 'Not drafted',
};

/** `b.ii` -> `(b)(ii)`; `""` -> `""`; `#2` -> `\#2`. */
export function partSuffix(part) {
  if (!part) return '';
  if (part.startsWith('#')) return String.raw`\,\#${part.slice(1)}`;
  return part.split('.').map((p) => `(${p})`).join('');
}

/** A part's label in the Question column: `18(a)`, `18(b)(ii)`, `18`. */
export function schemeLabel(q, part) {
  return `${q}${partSuffix(part)}`;
}

/**
 * A scheme's LaTeX, set on one line of the output: a `%` left unescaped is a
 * percent sign, since as a comment it would swallow the rest of the row.
 */
export function latex(text) {
  return text.replace(/(?<=(?:^|[^\\])(?:\\\\)*)%/g, String.raw`\%`);
}

/** A Scheme entry: each line of the block a line of the cell, 4pt apart. */
export function schemeCell(scheme) {
  const lines = scheme.replace(/\n+$/, '').split('\n').map((l) => latex(l.trim()));
  return `{${lines.join(String.raw`\\[4pt] `)}}`;
}

const tie = (code) => code.replaceAll(' ', '~');

/** A row's codes, on one line: `A1 AG` never splits, a pair too wide stacks. */
export function markCodes(marks, { draft = false } = {}) {
  return marks
    .map((m) => (draft && m.query ? String.raw`\msQueried{${tie(m.code)}}{${tie(m.query.code)}}` : tie(m.code)))
    .join(' ');
}

/** A row's notes: one mark's alone; two marks' each led by its code. */
export function markNotes(marks, { draft = false } = {}) {
  const blocks = marks
    .map((m) => {
      const lines = [];
      if (m.note) lines.push(latex(m.note));
      if (draft && m.query) lines.push(String.raw`\msQuery{${latex(m.query.why)}}`);
      return { m, lines };
    })
    .filter((b) => b.lines.length);
  if (!blocks.length) return '';
  const tagged = marks.length > 1;
  const lines = blocks.flatMap(({ m, lines: [first, ...rest] }) => [
    tagged ? String.raw`\msNote{${tie(m.code)}}{${first}}` : first,
    ...rest,
  ]);
  return `{${lines.join(String.raw`\\ `)}}`;
}

/** `marks` beside a part's label on the front page: `(a)\,4`. */
function partMarks(q) {
  if (q.parts.length === 1 && q.parts[0].part === '') return '';
  return q.parts.map((p) => `${partSuffix(p.part) || q.q}\\,${p.marks}`).join(String.raw`\msSep `);
}

/**
 * A figure's `\msFigure`, drawn at its line width in the solution box: a
 * part's (one list deep) by default, the depth written otherwise. The
 * preamble measures depths 0 to 3.
 */
export function figureCall(depth) {
  const d = Math.min(depth, 3);
  return d === 1 ? String.raw`\msFigure` : String.raw`\msFigure[${d}]`;
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** A table row's line: its cells, with `\nopagebreak` to keep it with the row above. */
function rowLine({ cells, nobreak }) {
  const line = cells.reduce((acc, c, i) => (i === 0 ? c : `${acc} &${c ? ` ${c}` : ''}`), '').trimStart();
  return `${nobreak ? String.raw`\nopagebreak ` : ''}${line} \\\\`;
}

/** A comma list of tabularray row numbers, runs written as ranges. */
function rowList(numbers) {
  const out = [];
  for (let i = 0; i < numbers.length; i++) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++;
    out.push(j > i ? `${numbers[i]}-${numbers[j]}` : String(numbers[i]));
    i = j;
  }
  return out.join(',');
}

/**
 * One question's page.
 *
 * @param {object} question - The scheme's question
 * @param {import('./markscheme.mjs').PackQuestion} packQ
 * @param {{ draft?: boolean }} opts
 */
export function renderQuestion(question, packQ, { draft = false } = {}) {
  const q = question.q;
  const solution = packQ.solution.split('\n');
  const pictures = solutionPictures(solution);
  const { depths } = solutionFigures(solution);
  /** @type {{ cells: string[], start?: boolean, nobreak?: boolean, tint?: boolean, total?: boolean }[]} */
  const rows = [];
  const single = question.parts.length === 1 && question.parts[0].part === '';

  const method = (methodRows, tint) => {
    for (const r of methodRows) {
      const marks = r.marks ?? [];
      if (!draft && marks.some((m) => m.query)) throw new Error(`Q${q}: a queried mark renders only in a draft`);
      if (r.figure === undefined) {
        rows.push({ cells: ['', schemeCell(r.scheme), markCodes(marks, { draft }), markNotes(marks, { draft })], tint });
        continue;
      }
      const picture = pictures[r.figure - 1];
      if (picture === undefined) throw new Error(`Q${q}: no figure ${r.figure} in the solution`);
      rows.push({ cells: ['', String.raw`\SetCell[c=3]{c} ${figureCall(depths[r.figure - 1])}{${picture}}`, '', ''], tint });
      for (const m of marks) {
        rows.push({
          cells: ['', String.raw`\msFeature{${capitalise(m.feature)}}`, markCodes([m], { draft }), markNotes([m], { draft })],
          tint,
        });
      }
    }
  };

  question.parts.forEach((part, i) => {
    const packPart = packQ.parts[i];
    if (!packPart || packPart.part !== part.part) {
      throw new Error(`Q${q}: part ${i + 1} is ${JSON.stringify(part.part)}; the pack has ${JSON.stringify(packPart?.part)}`);
    }
    const first = rows.length;
    if (part.flag !== undefined) {
      if (!draft) throw new Error(`Q${q}: a flagged part renders only in a draft`);
      const title = FLAG_TITLES[part.flag.kind] ?? part.flag.kind;
      rows.push({ cells: ['', String.raw`\SetCell[c=3]{l} \msFlag{${title}}{${latex(part.flag.why)}}`, '', ''] });
    } else {
      method(part.rows ?? [], false);
      if (part.alt) {
        rows.push({ cells: ['', String.raw`\SetCell[c=3]{l} \msAlternative{${latex(part.alt.title ?? '')}}`, '', ''], tint: true });
        const titleRow = rows.length;
        method(part.alt.rows ?? [], true);
        if (rows[titleRow]) rows[titleRow].nobreak = true;
      }
    }
    if (!single) rows.push({ cells: ['', '', `[${packPart.marks}]`, ''], nobreak: true });
    rows[first].start = true;
    rows[first].cells[0] = schemeLabel(q, part.part);
  });
  const total = packQ.parts.reduce((s, p) => s + p.marks, 0);
  rows.push({
    cells: [String.raw`\SetCell[c=2]{r} Total for Question ${q}`, '', String(total), ''],
    start: true,
    nobreak: true,
    total: true,
  });

  // Rows count from 1, the head row; the scarlet rule above row 2 and the
  // outer rules are the preamble's.
  const inner = [];
  const full = [];
  const tinted = [];
  let totalRow = 0;
  rows.forEach((r, i) => {
    const t = i + 2;
    if (i > 0) (r.start ? full : inner).push(t);
    if (r.tint) tinted.push(t);
    if (r.total) totalRow = t;
  });
  const specs = [];
  if (inner.length) specs.push(`hline{${rowList(inner)}} = {2-Z}{0.4pt, msGrid},`);
  if (full.length) specs.push(`hline{${rowList(full)}} = {0.4pt, msGrid},`);
  // Each alternative's rows are one run; a part has at most one.
  for (const run of rowList(tinted).split(',').filter(Boolean)) specs.push(`cell{${run}}{2-4} = {bg=msTint},`);
  specs.push(String.raw`row{${totalRow}} = {font=\bfseries},`);

  return [
    String.raw`\msQuestion{${q}}`,
    String.raw`\begin{msscheme}{`,
    ...specs.map((s) => `  ${s}`),
    '}',
    String.raw`Question & Scheme & Marks & Notes \\`,
    ...rows.map(rowLine),
    String.raw`\end{msscheme}`,
  ].join('\n');
}

/**
 * The front page: the heading, then the contents table.
 *
 * @param {import('./markscheme.mjs').Pack} pack
 */
export function renderFrontPage(pack) {
  const totals = pack.questions.map((q) => q.parts.reduce((s, p) => s + p.marks, 0));
  const all = totals.reduce((s, t) => s + t, 0);
  return [
    String.raw`\djsSetQuestionCount{${pack.questions.length}}`,
    ...pack.questions.map((q, i) => String.raw`\djsAddMarks{${q.q}}{${totals[i]}}`),
    String.raw`\vspace*{6pt}`,
    String.raw`\djsContentsTitle`,
    String.raw`\vspace{30pt}`,
    String.raw`\msContentsHeading`,
    String.raw`\begin{mscontents}{}`,
    String.raw`Question & Marks by part & Marks & Page \\`,
    ...pack.questions.map((q, i) =>
      rowLine({
        cells: [String.raw`\msContentsQuestion{${q.q}}`, partMarks(q), String(totals[i]), String.raw`\msContentsPage{${q.q}}`],
      }),
    ),
    rowLine({ cells: [String.raw`\SetCell[c=2]{r} Total`, '', String(all), ''] }),
    String.raw`\end{mscontents}`,
    String.raw`\newpage`,
  ].join('\n');
}

/**
 * The scheme's `.tex`.
 *
 * @param {object} scheme - A checked scheme (`checkScheme`'s `scheme`)
 * @param {import('./markscheme.mjs').Pack} pack
 * @param {{ draft?: boolean, shared?: string }} [opts] - `shared`: the
 *   shared folder, relative to the `.tex`
 */
export function renderScheme(scheme, pack, { draft = false, shared = SHARED_DIR } = {}) {
  if (scheme.questions.length !== pack.questions.length) {
    throw new Error(`the scheme has ${scheme.questions.length} questions; the pack has ${pack.questions.length}`);
  }
  const head = [
    String.raw`\documentclass[leqno]{article}`,
    String.raw`\input{${shared}/markscheme_preamble.tex}`,
    '',
    String.raw`\djsSchemeHeader{${pack.title}}`,
    ...(pack.strand && pack.section ? [String.raw`\djsSitePath{${pack.strand}}{${pack.section}}`] : []),
    '',
    String.raw`\djsLastUpdated{${scheme.last_updated}}`,
    String.raw`\begin{document}`,
  ];
  const pages = scheme.questions.map((question, i) => {
    const packQ = pack.questions[i];
    if (question.q !== packQ.q) throw new Error(`question ${i + 1} of the scheme is Q${question.q}; the pack's is Q${packQ.q}`);
    return renderQuestion(question, packQ, { draft });
  });
  return [
    ...head,
    renderFrontPage(pack),
    String.raw`\input{${shared}/markscheme_conventions.tex}`,
    '',
    pages.join('\n\n'),
    '',
    String.raw`\end{document}`,
    '',
  ].join('\n');
}
