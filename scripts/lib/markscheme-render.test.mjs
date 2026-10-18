import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkScheme, emitScheme, readPack, solutionFigures, solutionPictures } from './markscheme.mjs';
import {
  markCodes,
  markNotes,
  renderFrontPage,
  renderQuestion,
  renderScheme,
  schemeCell,
  schemeLabel,
} from './markscheme-render.mjs';
import { checkPackPreambleComments, checkSchemePreambleConvention } from './pack-preamble.mjs';

// The fixture: a pack of four questions (one from each pilot pack, the
// Reflections in Planes question with an alternative, and the Oblique
// Collisions question whose part (a) is longer than a page), its scheme,
// and the scheme's rendered pages as golden files. Run with UPDATE_GOLDEN=1
// to rewrite them after a deliberate change, then compile and look.
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'markscheme');
const MS = join(FIXTURE, 'ms');
const SHARED = relative(MS, resolve(HERE, '..', '..', 'public', 'tex', '_shared')).replace(/\\/g, '/');
const { pack } = readPack(join(FIXTURE, 'qbt', '_QBT__Fixture.tex'));
const yamlText = readFileSync(join(MS, '_QBT___MS__Fixture.yaml'), 'utf8');
const checked = checkScheme(yamlText, pack, { today: new Date(2026, 9, 18) });
const scheme = checked.scheme;
const clone = () => structuredClone(scheme);

/** The draft fixture: a query on a lone mark, one in a pair, and a flagged part. */
function draftScheme() {
  const s = clone();
  const [q2a] = s.questions[1].parts;
  q2a.rows[0].marks[0].query = { code: 'M1', why: "The initial energy needs Hooke's formula applied, a method." };
  q2a.rows[1].marks[1].query = { code: 'A1ft', why: 'The equation may carry an earlier wrong elastic energy.' };
  const q4b = s.questions[3].parts[1];
  delete q4b.rows;
  q4b.flag = { kind: 'not_drafted', why: 'The drafting run stopped before this part.' };
  return s;
}

function golden(name, text) {
  const path = join(MS, name);
  if (process.env.UPDATE_GOLDEN) writeFileSync(path, text);
  expect(existsSync(path)).toBe(true);
  expect(text).toBe(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
}

const questionOf = (text, q) => {
  const start = text.indexOf(`\\msQuestion{${q}}`);
  return text.slice(start, text.indexOf('\\end{msscheme}', start));
};

describe('the fixture', () => {
  it('passes the checker, as every rendered scheme must', () => {
    expect(checked.errors).toEqual([]);
    expect(checked.warnings).toEqual([]);
  });

  it('renders the golden scheme', () => {
    golden('_QBT___MS__Fixture.tex', renderScheme(scheme, pack, { shared: SHARED }));
  });

  it('renders the golden draft, with its queries and flag', () => {
    const s = draftScheme();
    expect(checkScheme(emitScheme(s), pack, { today: new Date(2026, 9, 18), draft: true }).errors).toEqual([]);
    golden('_QBT___MS__Fixture-draft.tex', renderScheme(s, pack, { shared: SHARED, draft: true }));
  });

  it('is deterministic', () => {
    expect(renderScheme(clone(), pack, { shared: SHARED })).toBe(renderScheme(clone(), pack, { shared: SHARED }));
  });
});

describe('the document', () => {
  const text = renderScheme(scheme, pack);

  it('inputs the scheme preamble and sets the header, site path and colophon', () => {
    expect(text.split('\n').slice(0, 8)).toEqual([
      String.raw`\documentclass[leqno]{article}`,
      String.raw`\input{../../../../_shared/markscheme_preamble.tex}`,
      '',
      String.raw`\djsSchemeHeader{Mark Scheme Fixture}`,
      String.raw`\djsSitePath{Core Pure}{Polar Coordinates}`,
      '',
      String.raw`\djsLastUpdated{18 October 2026}`,
      String.raw`\begin{document}`,
    ]);
  });

  it('inputs the conventions after the front page, before the first question', () => {
    const front = text.indexOf(String.raw`\end{mscontents}`);
    const conventions = text.indexOf(String.raw`\input{../../../../_shared/markscheme_conventions.tex}`);
    expect(front).toBeGreaterThan(0);
    expect(conventions).toBeGreaterThan(front);
    expect(text.slice(front, conventions)).toContain(String.raw`\newpage`);
    expect(text.indexOf(String.raw`\msQuestion{1}`)).toBeGreaterThan(conventions);
  });

  it('keeps the scheme wrapper check-pack-preamble requires', () => {
    const rel = 'public/tex/further-maths/core-pure/polar-coordinates/ms/_QBT___MS__Fixture.tex';
    expect(checkSchemePreambleConvention(text, rel)).toEqual([]);
    expect(checkPackPreambleComments(text, rel)).toEqual([]);
  });

  it('holds no comments', () => {
    for (const line of text.split('\n')) expect(line).not.toMatch(/(?<!\\)%./);
    expect(renderScheme(draftScheme(), pack, { draft: true })).not.toMatch(/(?<!\\)%./);
  });

  it('starts every question on its own page with its link target and bookmark', () => {
    expect(text.match(/\\msQuestion\{\d+\}/g)).toEqual(['1', '2', '3', '4'].map((n) => `\\msQuestion{${n}}`));
  });
});

describe('the front page', () => {
  const front = renderFrontPage(pack);

  it('sets the heading counts, since a scheme has no \\questionitem or \\marks', () => {
    expect(front).toContain(String.raw`\djsSetQuestionCount{4}`);
    expect(front.match(/\\djsAddMarks\{\d+\}\{\d+\}/g)).toEqual([
      String.raw`\djsAddMarks{1}{7}`,
      String.raw`\djsAddMarks{2}{6}`,
      String.raw`\djsAddMarks{3}{8}`,
      String.raw`\djsAddMarks{4}{18}`,
    ]);
  });

  it('lists each question with its marks by part, its total and its linked page', () => {
    expect(front).toContain(String.raw`\msContentsQuestion{1} & (a)\,3\msSep (b)\,4 & 7 & \msContentsPage{1} \\`);
    expect(front).toContain(String.raw`\msContentsQuestion{3} & & 8 & \msContentsPage{3} \\`);
    expect(front).toContain(String.raw`\SetCell[c=2]{r} Total & & 39 & \\`);
  });

  it('writes a sub-part label in full', () => {
    const p = { ...pack, questions: [{ q: 1, parts: [{ part: 'a', marks: 2 }, { part: 'b.ii', marks: 3 }] }] };
    expect(renderFrontPage(p)).toContain(String.raw`(a)\,2\msSep (b)(ii)\,3`);
  });
});

describe('a question page', () => {
  const page = (q, opts) => renderQuestion(scheme.questions[q - 1], pack.questions[q - 1], opts);

  it('labels a part in its first row only, with no rule across the Question column inside it', () => {
    const lines = page(2).split('\n');
    expect(lines.filter((l) => /^2\(/.test(l)).map((l) => l.split(' & ')[0])).toEqual(['2(a)', '2(b)']);
    expect(lines).toContain('  hline{3-5,7-8} = {2-Z}{0.4pt, msGrid},');
    expect(lines).toContain('  hline{6,9} = {0.4pt, msGrid},');
  });

  it('ends each part with its total row, kept with the row above, and the question with its total', () => {
    const text = page(2);
    expect(text).toContain(String.raw`\nopagebreak & & [4] & \\`);
    expect(text).toContain(String.raw`\nopagebreak & & [2] & \\`);
    expect(text).toContain(String.raw`\nopagebreak \SetCell[c=2]{r} Total for Question 2 & & 6 & \\`);
    expect(text).toContain(String.raw`row{9} = {font=\bfseries},`);
  });

  it('leaves out the part total row for a question that is one unlabelled part', () => {
    const text = page(3);
    expect(text).not.toMatch(/& \[8\] &/);
    expect(text).toContain(String.raw`Total for Question 3 & & 8 & \\`);
    expect(text.split('\n').find((l) => l.startsWith('3 &'))).toBeDefined();
  });

  it('tints an alternative, from its title row, in Scheme, Marks and Notes', () => {
    const text = page(3);
    expect(text).toContain(String.raw`& \SetCell[c=3]{l} \msAlternative{the line through \(A\) along the normal} & & \\`);
    const rows = text.split('\n').filter((l) => l.endsWith('\\\\'));
    const title = rows.findIndex((l) => l.includes('msAlternative'));
    expect(text).toContain(`cell{${title + 1}-${rows.length - 1}}{2-4} = {bg=msTint},`);
    expect(rows[title + 1]).toMatch(/^\\nopagebreak /);
  });

  it('sets a figure alone on a full row, then a row per feature mark', () => {
    const text = page(1);
    const pictures = solutionPictures(pack.questions[0].solution.split('\n'));
    expect(text).toContain(String.raw`1(a) & \SetCell[c=3]{c} \msFigure{${pictures[0]}} & & \\`);
    expect(text).toContain(String.raw`& \msFeature{Shape} & B1 & {A cardioid, symmetric about the initial line, with its cusp at the pole.} \\`);
    expect(text).toContain(String.raw`& \msFeature{Labelled point} & B1 &`);
    expect(text).toContain(String.raw`& \msFeature{Half-line} & B1 &`);
  });

  it('breaks a long part between rows, with no row kept to the one above but its totals', () => {
    const text = page(4);
    const rows = text.split('\n').filter((l) => l.endsWith('\\\\')).slice(1);
    const kept = rows.filter((l) => l.startsWith('\\nopagebreak'));
    expect(kept).toEqual([
      String.raw`\nopagebreak & & [16] & \\`,
      String.raw`\nopagebreak & & [2] & \\`,
      String.raw`\nopagebreak \SetCell[c=2]{r} Total for Question 4 & & 18 & \\`,
    ]);
  });

  it('refuses a flag or a query outside a draft', () => {
    const d = draftScheme();
    expect(() => renderQuestion(d.questions[3], pack.questions[3])).toThrow(/only in a draft/);
    expect(() => renderQuestion(d.questions[1], pack.questions[1])).toThrow(/only in a draft/);
  });

  it('refuses a part that is not the pack\'s', () => {
    const s = clone();
    s.questions[1].parts[0].part = 'c';
    expect(() => renderQuestion(s.questions[1], pack.questions[1])).toThrow(/part 1/);
  });
});

describe('a draft', () => {
  const d = draftScheme();
  const text = renderScheme(d, pack, { draft: true });

  it('shows a queried code as `B1 → M1?`, with the why under its note', () => {
    const q2 = questionOf(text, 2);
    expect(q2).toContain(String.raw`& \msQueried{B1}{M1} & {The initial elastic energy, and none once \(P\) is \(\frac32 a\) above \(O\).\\ \msQuery{The initial energy needs Hooke's formula applied, a method.}} \\`);
    expect(q2).toContain(String.raw`& M1 \msQueried{A1}{A1ft} & {\msNote{M1}{Forms an energy equation with kinetic, gravitational and elastic terms, each of the right form.}\\ \msNote{A1}{\msQuery{The equation may carry an earlier wrong elastic energy.}}} \\`);
  });

  it('shows a flag in its part\'s place, before the part total', () => {
    const q4 = questionOf(text, 4);
    expect(q4).toContain(
      String.raw`4(b) & \SetCell[c=3]{l} \msFlag{Not drafted}{The drafting run stopped before this part.} & & \\` +
        '\n' +
        String.raw`\nopagebreak & & [2] & \\`,
    );
  });

  it('differs from the committed render only where it queries or flags', () => {
    const plain = renderScheme(scheme, pack).split('\n');
    const changed = text.split('\n').filter((l) => !plain.includes(l));
    expect(changed.every((l) => /msQueried|msQuery|msFlag|hline|row\{/.test(l))).toBe(true);
  });
});

describe('cells', () => {
  it('labels a part as the boards do', () => {
    expect(schemeLabel(18, 'a')).toBe('18(a)');
    expect(schemeLabel(18, 'b.ii')).toBe('18(b)(ii)');
    expect(schemeLabel(18, '')).toBe('18');
    expect(schemeLabel(18, '#2')).toBe(String.raw`18\,\#2`);
  });

  it('sets each line of a Scheme entry as a line of its cell, 4pt apart', () => {
    expect(schemeCell('\\(a = 1\\)\n')).toBe('{\\(a = 1\\)}');
    expect(schemeCell('\\(a = 1\\)\n  \\(b = 2\\)\n')).toBe(String.raw`{\(a = 1\)\\[4pt] \(b = 2\)}`);
  });

  it('keeps a row\'s codes on one line, `A1 AG` whole, so only a pair too wide stacks', () => {
    expect(markCodes([{ code: 'M1' }, { code: 'A1' }])).toBe('M1 A1');
    expect(markCodes([{ code: 'dM1' }, { code: 'A1 AG' }])).toBe('dM1 A1~AG');
    expect(markCodes([{ code: 'A1 AG', query: { code: 'A1', why: 'x' } }])).toBe('A1~AG');
    expect(markCodes([{ code: 'A1 AG', query: { code: 'A1', why: 'x' } }], { draft: true })).toBe(String.raw`\msQueried{A1~AG}{A1}`);
  });

  it('gives one mark its note alone, and two marks each a note led by its code', () => {
    expect(markNotes([{ code: 'A1' }])).toBe('');
    expect(markNotes([{ code: 'M1', note: 'Uses x.' }])).toBe('{Uses x.}');
    expect(markNotes([{ code: 'M1', note: 'Uses x.' }, { code: 'A1' }])).toBe(String.raw`{\msNote{M1}{Uses x.}}`);
    expect(markNotes([{ code: 'M1', note: 'Uses x.' }, { code: 'A1 AG', note: 'cso.' }])).toBe(
      String.raw`{\msNote{M1}{Uses x.}\\ \msNote{A1~AG}{cso.}}`,
    );
  });
});

describe('solutionPictures', () => {
  it('copies each counted picture alone, as solutionFigures counts them', () => {
    const lines = [
      String.raw`Sketch:\par\nopagebreak`,
      String.raw`\begin{djsSolutionFigure}`,
      String.raw`  \begin{tikzpicture}[scale=2]`,
      String.raw`    \def\R{0.8}   % sphere radius`,
      '',
      String.raw`    \draw (0,0) circle (\R);%`,
      String.raw`    \begin{tikzpicture}\end{tikzpicture}`,
      String.raw`  \end{tikzpicture}`,
      String.raw`\end{djsSolutionFigure}`,
      String.raw`Then \begin{tikzpicture}\draw (0,0) -- (1,1);\end{tikzpicture} inline, 50\% of it.`,
    ];
    const pictures = solutionPictures(lines);
    expect(pictures).toHaveLength(solutionFigures(lines).starts.length);
    expect(pictures[0]).toBe(
      [
        String.raw`\begin{tikzpicture}[scale=2]`,
        String.raw`  \def\R{0.8}`,
        String.raw`  \draw (0,0) circle (\R);%`,
        String.raw`  \begin{tikzpicture}\end{tikzpicture}`,
        String.raw`\end{tikzpicture}`,
      ].join('\n'),
    );
    expect(pictures[1]).toBe(String.raw`\begin{tikzpicture}\draw (0,0) -- (1,1);\end{tikzpicture}`);
  });

  it('ignores a picture in a comment', () => {
    expect(solutionPictures(['% \\begin{tikzpicture}', '% \\end{tikzpicture}'])).toEqual([]);
  });
});
