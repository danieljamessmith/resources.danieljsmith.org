import { describe, it, expect } from 'vitest';
import YAML from 'yaml';
import {
  checkQuestion,
  checkScheme,
  codeProblem,
  emitScheme,
  packMarks,
  packModel,
  packPaths,
  parseCodes,
  parseOnly,
  parseYaml,
  partLabel,
  qbtPathForScheme,
  questionStamp,
  renumberScheme,
  schemeStatus,
  solutionFigures,
  spliceQuestions,
  stampQuestions,
  writableProblems,
} from './markscheme.mjs';

const HEAD = String.raw`\documentclass[leqno]{article}
\input{../../../../_shared/pack_preamble.tex}
\djsQbtHeader{Test \& Pack}
\djsSitePath{Core Pure}{Test Section}
\djsLastUpdated{1 October 2026}
\begin{document}
\djsFrontMatter
\begin{enumerate}[label=\textbf{\arabic*.}]
`;
const FOOT = String.raw`\end{enumerate}
\end{document}
`;

const STATEMENTS = {
  1: String.raw`Let \(y = x^2\).
\begin{enumerate}[label=\textbf{(\alph*)}]
  \item Sketch the curve. \marks{2}
  \item Find the area under it from 0 to 1. \marks{3}
\end{enumerate}`,
  2: String.raw`Prove that \(1 + 1 = 2\). \marks{4}`,
  3: String.raw`\begin{enumerate}[label=\textbf{(\alph*)}]
  \item
  \begin{enumerate}[label=(\roman*)]
    \item Find \(a\). \marks{2}
    \item Find \(b\). \marks[2em]{2}
  \end{enumerate}
  \item Hence find \(c\). \marks{3}
\end{enumerate}`,
};

const SOLUTIONS = {
  1: String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1);
\node at (0,0) {\begin{tikzpicture}\draw (0,0) circle (1);\end{tikzpicture}};
\end{tikzpicture}
\begin{djsSolutionFigure}
  \begin{tikzpicture}
  \draw (0,0) parabola (1,1);
  \end{tikzpicture}
\end{djsSolutionFigure}
The area is \(\frac13\).`,
  2: String.raw`Since \(1 + 1 = 2\), done.`,
  3: String.raw`\def\k{2}
\begin{tikzpicture}
\draw (0,0) -- (\k,0);
\end{tikzpicture}
So \(a = 1\), \(b = 2\), \(c = 3\).`,
};

function qbtText(order = [1, 2, 3], statements = STATEMENTS) {
  const blocks = order.map(
    (n, i) => `% ---- Question ${i + 1} ----\n\\questionitem\n% [Source: _QBT__Test, Q${n}]\n${statements[n]}\n\n\\newpage\n\n`,
  );
  return HEAD + blocks.join('') + FOOT;
}

function solnText(order = [1, 2, 3], statements = STATEMENTS, solutions = SOLUTIONS) {
  const blocks = order.map(
    (n, i) =>
      `% ---- Question ${i + 1} ----\n\\questionitem\n${statements[n]}\n\n\\vspace*{10pt}\n\n\\begin{djsSolution}\n${solutions[n]}\n\\end{djsSolution}\n\n\\newpage\n\n`,
  );
  return HEAD.replace('djsQbtHeader', 'djsSolnHeader') + blocks.join('') + FOOT;
}

const PACK = packModel(qbtText(), solnText());
const stampOf = (q) => PACK.questions.find((p) => p.q === q).stamp;
const TODAY = new Date(2026, 9, 18);

function baseScheme() {
  return {
    format: 1,
    pack: String.raw`Test \& Pack`,
    last_updated: '1 October 2026',
    questions: [
      {
        q: 1,
        stamp: stampOf(1),
        parts: [
          {
            part: 'a',
            rows: [
              {
                figure: 2,
                marks: [
                  { code: 'B1', feature: 'shape' },
                  { code: 'B1', note: String.raw`The vertex at \((0, 0)\).`, feature: 'labelled point' },
                ],
              },
            ],
          },
          {
            part: 'b',
            rows: [
              {
                scheme: String.raw`\(\int_0^1 x^2 \,\mathrm{d}x\)` + '\n',
                marks: [{ code: 'M1', note: String.raw`Integrates \(x^2\) between their limits.` }],
              },
              {
                scheme: String.raw`\(= \left[\frac{x^3}{3}\right]_0^1\)` + '\n' + String.raw`\(= \frac13\)` + '\n',
                marks: [{ code: 'A1' }, { code: 'A1' }],
              },
            ],
          },
        ],
      },
      {
        q: 2,
        stamp: stampOf(2),
        parts: [
          {
            part: '',
            rows: [
              { scheme: String.raw`\(1 + 1 = 2\) stated` + '\n', marks: [{ code: 'B1' }] },
              {
                scheme: 'By the definition of addition\n',
                marks: [
                  { code: 'M1', note: 'Uses the definition of addition.' },
                  { code: 'dM1', note: 'Applies it a second time.' },
                ],
              },
              { scheme: String.raw`\(= 2\)` + '\n', marks: [{ code: 'A1 AG' }] },
            ],
          },
        ],
      },
      {
        q: 3,
        stamp: stampOf(3),
        parts: [
          {
            part: 'a.i',
            rows: [
              { scheme: String.raw`\(a + 1 = 2\)` + '\n', marks: [{ code: 'M1', note: 'Forms an equation in \\(a\\).' }, { code: 'A1' }] },
            ],
            alt: {
              title: 'By symmetry',
              rows: [
                { scheme: String.raw`\(a = 2 - a\)` + '\n', marks: [{ code: 'M1', note: 'Uses the symmetry.' }] },
                { scheme: String.raw`\(a = 1\)` + '\n', marks: [{ code: 'A1' }] },
              ],
            },
          },
          {
            part: 'a.ii',
            rows: [
              { scheme: String.raw`\(b = 2\)` + '\n', marks: [{ code: 'B1' }, { code: 'B1ft', note: String.raw`ft their \(a\).` }] },
            ],
          },
          {
            part: 'b',
            rows: [
              { scheme: String.raw`\(c = a + b\)` + '\n', marks: [{ code: 'M1', note: 'Adds their values.' }] },
              {
                scheme: String.raw`\(c = 1 + 2\)` + '\n',
                marks: [{ code: 'dM1', note: 'Uses their \\(a\\) from (a)(i).', depends_on: 'a.i:1' }],
              },
              { scheme: String.raw`\(c = 3\)` + '\n', marks: [{ code: 'A1' }] },
            ],
          },
        ],
      },
    ],
  };
}

/** Checks a scheme object (emitted canonically where it can be). */
function run(mutate = () => {}, opts = {}) {
  const scheme = baseScheme();
  mutate(scheme);
  let text;
  try {
    text = emitScheme(scheme);
  } catch {
    text = YAML.stringify(scheme);
  }
  return checkScheme(text, PACK, { today: TODAY, ...opts });
}

const rules = (problems) => [...new Set(problems.map((p) => p.rule))];
const part = (s, q, label) => s.questions.find((x) => x.q === q).parts.find((p) => p.part === label);

describe('packMarks', () => {
  it('labels marks by the enumerate nesting, as the PDF prints them', () => {
    expect(packMarks(qbtText()).map((m) => [m.q, m.part, m.count])).toEqual([
      [1, 'a', 2],
      [1, 'b', 3],
      [2, '', 4],
      [3, 'a.i', 2],
      [3, 'a.ii', 2],
      [3, 'b', 3],
    ]);
  });

  it('falls back to a place where a label cannot be read or would repeat', () => {
    const text = `${HEAD}% ---- Question 1 ----
\\questionitem
\\begin{enumerate}[label=\\textbf{(\\alph*)}]
  \\item[(x)] One. \\marks{1}
  \\item Two. \\marks{2}
\\end{enumerate}
More. \\marks{1}
% ---- Question 2 ----
\\questionitem
\\begin{enumerate}[label=\\textbf{(\\alph*)}, start=3]
  \\item Three. \\marks{3}
\\end{enumerate}
\\begin{enumerate}[label=\\textbf{(\\alph*)}, resume]
  \\item Four. \\marks{4} % \\marks{9} in a comment
\\end{enumerate}
${FOOT}`;
    expect(packMarks(text).map((m) => [m.q, m.part, m.count])).toEqual([
      [1, '#1', 1],
      [1, 'b', 2],
      [1, '', 1],
      [2, 'c', 3],
      [2, 'd', 4],
    ]);
  });

  it('refuses two marks on one line and a mark outside any question', () => {
    expect(() => packMarks(`${HEAD}% ---- Question 1 ----\n\\questionitem\nA \\marks{1} B \\marks{2}\n${FOOT}`)).toThrow(
      /two \\marks on one line/,
    );
    expect(() => packMarks(`${HEAD}\\marks{1}\n${FOOT}`)).toThrow(/outside any question/);
  });

  it('labels a part as the PDF prints it', () => {
    expect(partLabel(3, 'b.ii')).toBe('Q3(b)(ii)');
    expect(partLabel(3, '')).toBe('Q3');
    expect(partLabel(3, '#2')).toBe('Q3 #2');
  });
});

describe('packModel', () => {
  it('reads the title, site path and each question', () => {
    expect(PACK.title).toBe(String.raw`Test \& Pack`);
    expect(PACK.strand).toBe('Core Pure');
    expect(PACK.section).toBe('Test Section');
    expect(PACK.questions.map((q) => [q.q, q.figures, q.definesOutside])).toEqual([
      [1, 2, false],
      [2, 0, false],
      [3, 1, true],
    ]);
    expect(PACK.questions[1].statement).toBe(STATEMENTS[2]);
    expect(PACK.questions[1].parts).toEqual([{ part: '', marks: 4 }]);
  });

  it('marks each counted picture with a figure line, nested pictures not counted', () => {
    const marked = PACK.questions[0].solutionMarked.split('\n');
    expect(marked.filter((l) => /% figure/.test(l))).toEqual(['% figure 1', '  % figure 2']);
    expect(marked[0]).toBe('% figure 1');
    expect(PACK.questions[0].solution).not.toMatch(/% figure/);
    expect(solutionFigures(['% \\begin{tikzpicture}', 'text']).starts).toEqual([]);
    const sideBySide = {
      ...SOLUTIONS,
      2: String.raw`\begin{tikzpicture}\end{tikzpicture}\quad\begin{tikzpicture}\end{tikzpicture}`,
    };
    const pair = packModel(qbtText(), solnText([1, 2, 3], STATEMENTS, sideBySide)).questions[1];
    expect(pair.figures).toBe(2);
    expect(pair.solutionMarked.split('\n').slice(0, 2)).toEqual(['% figure 1', '% figure 2']);
  });

  it("gives each counted picture's list depth in the box, a list in a picture not counted", () => {
    const lines = [
      String.raw`\begin{tikzpicture}\node {\begin{itemize}\item x};\end{tikzpicture}`,
      String.raw`\begin{enumerate}[label=\textbf{(\alph*)}]`,
      String.raw`  \item Sketch:\par\nopagebreak % \begin{itemize}`,
      String.raw`  \begin{tikzpicture}\draw (0,0) -- (1,1);\end{tikzpicture}`,
      String.raw`  \item \begin{enumerate}\item \begin{tikzpicture}\end{tikzpicture}\end{enumerate}`,
      String.raw`  \begin{djsSolutionFigure}\begin{tikzpicture}\end{tikzpicture}\end{djsSolutionFigure}`,
      String.raw`\end{enumerate}`,
      String.raw`\begin{tikzpicture}\end{tikzpicture}`,
    ];
    const { starts, depths } = solutionFigures(lines);
    expect(starts).toEqual([0, 3, 4, 5, 7]);
    expect(depths).toEqual([0, 1, 2, 1, 0]);
  });

  it('stamps the statement and solution with whitespace collapsed', () => {
    expect(questionStamp('a  b\n c', 'd')).toBe(questionStamp('a b c', ' d '));
    expect(questionStamp('a b', 'c')).not.toBe(questionStamp('a b', 'd'));
    expect(stampOf(1)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('keeps a stamp across a reorder, which changes delimiters and source hints', () => {
    const moved = packModel(qbtText([3, 1, 2]), solnText([3, 1, 2]));
    expect(moved.questions.map((q) => q.stamp)).toEqual([stampOf(3), stampOf(1), stampOf(2)]);
  });

  it('finds the scheme and solutions files beside the questions file', () => {
    const paths = packPaths('/s/further-maths/core-pure/topic/qbt/_QBT___Odd_Name_.tex');
    const slash = (p) => p.replace(/\\/g, '/');
    expect(paths.stem).toBe('_Odd_Name_');
    expect(slash(paths.soln)).toBe('/s/further-maths/core-pure/topic/soln/_QBT___Solns___Odd_Name_.tex');
    expect(slash(paths.scheme)).toBe('/s/further-maths/core-pure/topic/ms/_QBT___MS___Odd_Name_.yaml');
    expect(slash(qbtPathForScheme(paths.scheme))).toBe(slash(paths.qbt));
    expect(() => packPaths('/s/topic/soln/_QBT___Solns__X.tex')).toThrow();
  });
});

describe('canonical form', () => {
  it('passes the base scheme with no errors or warnings', () => {
    const result = run();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('writes two-space indents, fields in order and literal Scheme blocks', () => {
    const text = emitScheme(baseScheme());
    expect(text).toContain(`questions:\n  - q: 1\n    stamp: ${stampOf(1)}\n    parts:\n      - part: a\n        rows:\n          - figure: 2\n`);
    expect(text).toContain("      - part: ''\n");
    expect(text).toContain('          - scheme: |\n              \\(= \\left[\\frac{x^3}{3}\\right]_0^1\\)\n              \\(= \\frac13\\)\n');
    expect(text).toContain("                depends_on: a.i:1\n");
    expect(text).toContain('pack: Test \\& Pack\nlast_updated: 1 October 2026\n');
  });

  it('round-trips: YAML to data to YAML, byte for byte', () => {
    const text = emitScheme(baseScheme());
    const back = parseYaml(text).value;
    expect(emitScheme(JSON.parse(JSON.stringify(back)))).toBe(text);
    expect(back).toEqual(baseScheme());
  });

  it('quotes only what YAML would misread, and keeps backslashes unescaped', () => {
    const s = baseScheme();
    const mark = part(s, 1, 'b').rows[0].marks[0];
    const cases = [
      ['Uses this: then that.', "'Uses this: then that.'"],
      ["Uses Newton's law # one", "'Uses Newton''s law # one'"],
      ['12345678', "'12345678'"],
      ['- a list?', "'- a list?'"],
      ['yes', 'yes'],
      ['no', 'no'],
      [String.raw`Uses \(\frac12 m v^2\).`, String.raw`Uses \(\frac12 m v^2\).`],
    ];
    for (const [note, written] of cases) {
      mark.note = note;
      const text = emitScheme(s);
      expect(text).toContain(`note: ${written}\n`);
      expect(parseYaml(text).value.questions[0].parts[1].rows[0].marks[0].note).toBe(note);
    }
    part(s, 3, 'b').rows[1].marks[0].depends_on = '1';
    expect(emitScheme(s)).toContain("depends_on: '1'\n");
    s.questions[0].stamp = '01234567';
    expect(emitScheme(s)).toContain("stamp: '01234567'\n");
  });

  it('writes a multi-line string as a literal block, and a Scheme block with leading spaces with an indent indicator', () => {
    const s = baseScheme();
    part(s, 1, 'b').rows[0].marks[0].note = 'Two\nlines';
    part(s, 1, 'b').rows[1].scheme = '  indented first\nsecond\n';
    const text = emitScheme(s);
    expect(text).toContain('note: |-\n                  Two\n                  lines\n');
    expect(text).toContain('scheme: |2\n                indented first\n              second\n');
    const back = parseYaml(text).value;
    expect(back.questions[0].parts[1].rows[1].scheme).toBe('  indented first\nsecond\n');
    expect(back.questions[0].parts[1].rows[0].marks[0].note).toBe('Two\nlines');
  });

  it('ends every Scheme block in one newline, whatever the data had', () => {
    const s = baseScheme();
    part(s, 2, '').rows[0].scheme = 'no newline';
    const text = emitScheme(s);
    expect(parseYaml(text).value.questions[1].parts[0].rows[0].scheme).toBe('no newline\n');
  });

  it('reads CRLF as LF, so a Windows checkout is still canonical', () => {
    const text = emitScheme(baseScheme()).replace(/\n/g, '\r\n');
    expect(checkScheme(text, PACK, { today: TODAY }).errors).toEqual([]);
  });

  it('reads YAML 1.2: no and on stay strings', () => {
    expect(parseYaml('a: no\nb: on\nc: yes\n').value).toEqual({ a: 'no', b: 'on', c: 'yes' });
  });

  it('gives the line of a YAML error', () => {
    expect(parseYaml('a: 1\r\nb: 2\r\nb: 3\r\n').errors).toEqual([{ line: 3, message: 'Map keys must be unique' }]);
    expect(checkScheme('format: 1\nquestions: [\n', PACK, { today: TODAY }).errors[0].where).toBe('line 3');
  });
});

describe('rule 1: parses, known fields and types, canonical', () => {
  const base = () => emitScheme(baseScheme());

  it('refuses a file that does not parse, or repeats a key', () => {
    expect(rules(checkScheme('questions: [\n', PACK, { today: TODAY }).errors)).toEqual([1]);
    const dup = base().replace('format: 1\n', 'format: 1\nformat: 1\n');
    expect(checkScheme(dup, PACK, { today: TODAY }).errors[0]).toMatchObject({ rule: 1 });
  });

  it('refuses unknown fields and the fields not in this version', () => {
    for (const [mutate, message] of [
      [(s) => (s.questions[0].source = 'x'), /unknown field `source`/],
      [(s) => (part(s, 1, 'b').part_notes = ['x']), /part notes/],
      [(s) => (part(s, 1, 'a').rows[0].width = 0.5), /widths/],
      [(s) => (part(s, 1, 'a').rows[0].place = 'full'), /no `place`/],
      [(s) => (s.questions[0].parts[1].rows[0].marks[0].total = 1), /unknown field `total`/],
    ]) {
      const result = run(mutate);
      expect(result.errors.some((e) => e.rule === 1 && message.test(e.message))).toBe(true);
    }
  });

  it('refuses wrong types and missing fields', () => {
    for (const [mutate, message] of [
      [(s) => (s.questions[0].q = '1'), /`q` must be a whole number/],
      [(s) => (s.format = 2), /`format` must be 1/],
      [(s) => (s.questions[0].stamp = 'ABCDEFGH'), /8 lowercase hex/],
      [(s) => delete s.last_updated, /missing `last_updated`/],
      [(s) => delete part(s, 2, '').rows, /needs `rows`/],
      [(s) => (part(s, 1, 'b').rows[0].scheme = ['x']), /`scheme` must be a string/],
      [(s) => (part(s, 3, 'a.i').alt.title = 'Two\nlines'), /few words on one line/],
      [(s) => (part(s, 1, 'b').rows[0].marks[0].query = 'E1'), /`query` must be a mapping/],
    ]) {
      const result = run(mutate);
      expect(result.errors.some((e) => e.rule === 1 && message.test(e.message)), String(message)).toBe(true);
    }
  });

  it('refuses a file not in canonical form, naming the first line that differs', () => {
    const cases = [
      base().replace('format: 1\n', 'format:  1\n'),
      base().replace(/(\n +)(note: The vertex.*)(\n +)(feature: labelled point)/, '$1$4$3$2'),
      base().replace('pack: Test \\& Pack', 'pack: "Test \\\\& Pack"'),
      base().replace(/scheme: \|\n/, 'scheme: |-\n'),
      `${base()}\n`,
      base().replace('pack: Test \\& Pack\nlast_updated: 1 October 2026\n', 'last_updated: 1 October 2026\npack: Test \\& Pack\n'),
      base().replace('questions:\n', '# a comment\nquestions:\n'),
    ];
    for (const text of cases) {
      const errors = checkScheme(text, PACK, { today: TODAY }).errors;
      expect(errors.some((e) => e.rule === 1 && /canonical/.test(e.message)), text.slice(0, 80)).toBe(true);
    }
  });
});

describe('rules 2-4: the file against the pack', () => {
  it('rule 2: pack is the header title, exactly', () => {
    expect(rules(run((s) => (s.pack = 'Test & Pack')).errors)).toEqual([2]);
  });

  it('rule 3: a valid date, not after today', () => {
    expect(rules(run((s) => (s.last_updated = '2026-10-01')).errors)).toEqual([3]);
    expect(rules(run((s) => (s.last_updated = '31 September 2026')).errors)).toEqual([3]);
    expect(rules(run((s) => (s.last_updated = '19 October 2026')).errors)).toEqual([3]);
    expect(run((s) => (s.last_updated = '18 October 2026')).errors).toEqual([]);
  });

  it('rule 4: one question per question, numbered in order', () => {
    expect(rules(run((s) => s.questions.pop()).errors)).toEqual([4]);
    const swapped = run((s) => s.questions.reverse());
    expect(rules(swapped.errors)).toContain(4);
  });

  it("rule 4: one part per \\marks, in order, with the pack's labels", () => {
    expect(rules(run((s) => (s.questions[0].parts[1].part = 'c')).errors)).toEqual([4]);
    expect(rules(run((s) => s.questions[2].parts.reverse()).errors)).toContain(4);
    expect(rules(run((s) => s.questions[2].parts.pop()).errors)).toEqual([4]);
  });
});

describe('rules 5-7: rows and strings', () => {
  it('rule 5: scheme or figure, not both; at most two marks on a Scheme row', () => {
    expect(rules(run((s) => (part(s, 1, 'a').rows[0].scheme = 'x\n')).errors)).toContain(5);
    expect(rules(run((s) => delete part(s, 1, 'b').rows[0].scheme).errors)).toContain(5);
    const three = run((s) => {
      const rows = part(s, 1, 'b').rows;
      rows[0].marks.push(...rows[1].marks);
      rows.pop();
    });
    expect(rules(three.errors)).toEqual([5]);
  });

  it('rule 6: no tab, form feed, backspace or carriage return; a broken \\n macro warns', () => {
    const tab = run((s) => (part(s, 1, 'b').rows[0].marks[0].note = 'Uses \\(\theta\\).'));
    expect(rules(tab.errors)).toEqual([6]);
    expect(tab.errors[0].message).toMatch(/theta/);
    const ff = run((s) => (part(s, 1, 'b').rows[0].scheme = '\\(\frac12\\)\n'));
    expect(rules(ff.errors)).toContain(6);
    const bs = run((s) => (part(s, 1, 'b').rows[0].marks[0].note = 'Uses \\(\beta\\).'));
    expect(rules(bs.errors)).toContain(6);
    expect(bs.errors.find((e) => e.rule === 6).message).toMatch(/beta/);
    const cr = run((s) => (part(s, 1, 'b').rows[0].marks[0].note = 'Uses \\(\rho\\).'));
    expect(rules(cr.errors)).toEqual([6]);
    expect(cr.errors[0].message).toMatch(/right/);
    const neq = run((s) => (part(s, 1, 'b').rows[0].marks[0].note = 'Uses \\(a \neq b\\).'));
    expect(neq.errors).toEqual([]);
    expect(rules(neq.warnings)).toEqual([6]);
  });

  it('rule 7: no empty Scheme line or note, no placeholder, no \\\\ at a line end', () => {
    expect(rules(run((s) => (part(s, 1, 'b').rows[1].scheme = 'a\n\nb\n')).errors)).toEqual([7]);
    expect(rules(run((s) => (part(s, 1, 'b').rows[0].marks[0].note = ' ')).errors)).toContain(7);
    expect(rules(run((s) => (part(s, 1, 'b').rows[0].marks[0].note = 'Uses TODO.')).errors)).toEqual([7]);
    expect(rules(run((s) => (part(s, 1, 'b').rows[1].scheme = '...\n')).errors)).toEqual([7]);
    expect(rules(run((s) => (part(s, 1, 'b').rows[1].scheme = '\\(a\\) \\\\\n\\(b\\)\n')).errors)).toEqual([7]);
    expect(rules(run((s) => (part(s, 3, 'a.i').alt.title = '?')).errors)).toEqual([7]);
  });

  it('rule 7: i and e plain, never \\mathrm{i} or \\mathrm{e}; differentials stay upright', () => {
    const unit = run((s) => (part(s, 1, 'b').rows[1].scheme = '\\(z = 3 + 2\\mathrm{i}\\)\n'));
    expect(rules(unit.errors)).toEqual([7]);
    expect(unit.errors[0].message).toMatch(/imaginary unit as a plain i/);
    const both = run((s) => (part(s, 1, 'b').rows[0].marks[0].note = 'Uses \\(\\mathrm{e}^{\\mathrm{i}\\theta}\\) and \\(\\mathrm{e}^{x}\\).'));
    expect(both.errors.map((e) => e.message)).toEqual([
      expect.stringMatching(/^\\mathrm\{e\} in the note: write the exponential/),
      expect.stringMatching(/^\\mathrm\{i\} in the note/),
    ]);
    expect(rules(run((s) => (part(s, 3, 'a.i').alt.title = 'Using \\(\\mathrm {e}^x\\)')).errors)).toEqual([7]);
    const plain = run((s) => (part(s, 1, 'b').rows[0].marks[0].note = 'Uses \\(e^{i\\theta}\\) and \\(\\int x\\,\\mathrm{d}x\\), \\(\\mathrm{Im}(z)\\).'));
    expect(plain.errors).toEqual([]);
  });

  it('rule 7: no straight double quote; their values in \\their{}, quoted words in `` and \'\'', () => {
    const value = run((s) => (part(s, 1, 'b').rows[1].scheme = '\\(\\text{"}3\\text{"} + 1\\)\n'));
    expect(rules(value.errors)).toEqual([7]);
    expect(value.errors[0].message).toMatch(/^a straight " in the Scheme column, which prints as a closing quote: write their value as \\their\{\.\.\.\}/);
    expect(rules(run((s) => (part(s, 1, 'b').rows[0].marks[0].note = 'Not for "true" alone.')).errors)).toEqual([7]);
    expect(rules(run((s) => (part(s, 3, 'a.i').alt.title = 'Using "their" root')).errors)).toEqual([7]);
    const quoted = run((s) => {
      part(s, 1, 'b').rows[1].scheme = '\\(\\their{3} + 1\\)\n';
      part(s, 1, 'b').rows[0].marks[0].note = "Uses their value. Not for ``true'' alone.";
    });
    expect(quoted.errors).toEqual([]);
  });
});

describe('rules 8-13: totals and codes', () => {
  it("rule 8: an unflagged part's marks number its \\marks (an offset one too)", () => {
    expect(rules(run((s) => part(s, 1, 'b').rows[1].marks.pop()).errors)).toEqual([8]);
    expect(rules(run((s) => part(s, 3, 'a.ii').rows[0].marks.pop()).errors)).toEqual([8]);
  });

  it("rule 9: the alternative's marks number the same", () => {
    expect(rules(run((s) => part(s, 3, 'a.i').alt.rows.pop()).errors)).toEqual([9]);
  });

  it('rule 10: every code is on the list, with the house spelling for the others', () => {
    for (const [code, message] of [
      ['A1*', /A1 AG/],
      ['AG', /lone AG/],
      ['B2', /B1/],
      ['M2', /two marks/],
      ['R1', /E1/],
      ['DM1', /dM1/],
      ['A0', /not a mark/],
      ['A1  AG', /as `A1 AG`/],
      ['B1 AG', /qualifies only A1/],
      ['X1', /not a mark code/],
    ]) {
      expect(codeProblem(code)).toMatch(message);
      const result = run((s) => (part(s, 2, '').rows[0].marks[0].code = code));
      expect(rules(result.errors)).toContain(10);
    }
    expect(codeProblem('A1 AG')).toBeNull();
  });

  it('rule 11: an A after a method mark; a dM1 after one or with depends_on; A1 AG last', () => {
    const aFirst = run((s) => {
      const rows = part(s, 1, 'b').rows;
      rows[0].marks[0] = { code: 'A1' };
      rows[1].marks[0] = { code: 'M1', note: 'Uses it.' };
    });
    expect(rules(aFirst.errors)).toEqual([11]);
    const dFirst = run((s) => (part(s, 2, '').rows[1].marks.reverse()));
    expect(rules(dFirst.errors)).toEqual([11]);
    const givenNotLast = run((s) => {
      const rows = part(s, 3, 'b').rows;
      rows[1].marks[0] = { code: 'A1 AG' };
    });
    expect(rules(givenNotLast.errors)).toEqual([11]);
    const twoMethods = run((s) => {
      const alt = part(s, 3, 'a.i').alt;
      alt.rows[0].marks[0] = { code: 'B1' };
    });
    expect(rules(twoMethods.errors)).toEqual([11]);
  });

  it('rule 12: depends_on only on a dM1, naming an earlier method mark, not the default, with a note', () => {
    const dm = (s) => part(s, 3, 'b').rows[1].marks[0];
    expect(rules(run((s) => (part(s, 3, 'b').rows[0].marks[0].depends_on = 'a.i:1')).errors)).toEqual([12]);
    expect(rules(run((s) => (dm(s).depends_on = '1')).errors)).toEqual([12]);
    expect(run((s) => (dm(s).depends_on = '1')).errors[0].message).toMatch(/default/);
    expect(rules(run((s) => (dm(s).depends_on = 'a.i:2')).errors)).toEqual([12]);
    expect(rules(run((s) => (dm(s).depends_on = 'b:1')).errors)).toEqual([12]);
    expect(rules(run((s) => (dm(s).depends_on = 'c:1')).errors)).toEqual([12]);
    expect(rules(run((s) => (dm(s).depends_on = 'first')).errors)).toEqual([12]);
    expect(rules(run((s) => (dm(s).depends_on = '3')).errors)).toEqual([12]);
    const noNote = run((s) => delete dm(s).note);
    expect(rules(noNote.errors)).toEqual([12, 15]);
    const ownEarlier = run((s) => {
      const rows = part(s, 3, 'b').rows;
      rows.unshift({ scheme: 'x\n', marks: [{ code: 'M1', note: 'Sets up.' }] });
      rows[3].marks = [];
      rows[2].marks[0].depends_on = '1';
    });
    expect(ownEarlier.errors.filter((e) => e.rule === 12)).toEqual([]);
  });

  it("rule 13: a figure row's marks are B1 or B1ft with a feature, and no other mark has one", () => {
    expect(rules(run((s) => (part(s, 1, 'a').rows[0].marks[0].code = 'M1')).errors)).toContain(13);
    expect(rules(run((s) => delete part(s, 1, 'a').rows[0].marks[0].feature).errors)).toEqual([13]);
    expect(rules(run((s) => (part(s, 1, 'a').rows[0].marks[0].feature = 'colour')).errors)).toEqual([13]);
    expect(rules(run((s) => (part(s, 2, '').rows[0].marks[0].feature = 'shape')).errors)).toEqual([13]);
  });
});

describe('rule 14: the codes given', () => {
  const codes = () =>
    parseCodes({
      questions: [
        {
          q: 3,
          parts: [
            { part: 'a.i', codes: [{ code: 'M1', words: 'forms it' }, { code: 'A1' }], alt: ['M1', 'A1'] },
            { part: 'a.ii', codes: ['B1', 'B1ft'] },
            { part: 'b', codes: ['M1', 'dM1', 'A1'] },
          ],
        },
      ],
    });
  const q3 = () => baseScheme().questions[2];

  it('passes a question whose codes are those given', () => {
    expect(checkQuestion(q3(), PACK, { codes: codes() }).errors).toEqual([]);
  });

  it('refuses other codes, a missing or extra alternative, a part with none given', () => {
    const swapped = q3();
    swapped.parts[1].rows[0].marks.reverse();
    swapped.parts[1].rows[0].marks[0].note = 'ft their \\(a\\).';
    expect(rules(checkQuestion(swapped, PACK, { codes: codes() }).errors)).toContain(14);
    const noAlt = q3();
    delete noAlt.parts[0].alt;
    expect(rules(checkQuestion(noAlt, PACK, { codes: codes() }).errors)).toEqual([14]);
    const altCodes = q3();
    altCodes.parts[0].alt.rows[1].marks[0] = { code: 'A1ft', note: 'ft their equation.' };
    expect(rules(checkQuestion(altCodes, PACK, { codes: codes() }).errors)).toEqual([14]);
    const flat = parseCodes({ parts: [{ q: 3, part: 'a.i', codes: ['M1', 'A1'] }] });
    expect(rules(checkQuestion(q3(), PACK, { codes: flat }).errors)).toEqual([14]);
  });

  it('reads codes as a flat list, by part, or nested by question', () => {
    expect(parseCodes([{ q: 1, part: 'a', codes: ['B1'] }]).get(1).get('a')).toEqual({ codes: ['B1'], alt: null });
    expect(() => parseCodes({ parts: [{ part: 'a', codes: ['B1'] }] })).toThrow(/question/);
    expect(() => parseCodes({ parts: [{ q: 1, part: 'a', codes: [3] }] })).toThrow(/not a code/);
  });
});

describe('rules 15-19: notes', () => {
  const note = (s) => part(s, 1, 'b').rows[0].marks[0];

  it('rule 16: energy abbreviations are allowed in notes', () => {
    for (const word of ['KE', 'GPE', 'EPE']) {
      const result = run((s) => (note(s).note = `Uses ${word} on the LHS and RHS.`));
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    }
  });

  it('rule 15: M1, dM1, E1, A1ft and B1ft have notes', () => {
    expect(rules(run((s) => delete note(s).note).errors)).toEqual([15]);
    expect(rules(run((s) => delete part(s, 3, 'a.ii').rows[0].marks[1].note).errors)).toEqual([15]);
    expect(rules(run((s) => delete part(s, 2, '').rows[1].marks[1].note).errors)).toEqual([15]);
    expect(rules(run((s) => (part(s, 2, '').rows[0].marks[0] = { code: 'E1' })).errors)).toEqual([15]);
    expect(rules(run((s) => (part(s, 1, 'b').rows[1].marks[1] = { code: 'A1ft' })).errors)).toEqual([15]);
  });

  it("rule 16: no board abbreviation outside maths; other capitals warn; LHS, RHS and AG don't", () => {
    for (const word of ['bod', 'www', 'rot', 'PI', 'BC', 'DR', 'dep', 'indep', 'ACF', 'AWFW', 'NMS', 'CWO', 'cwo']) {
      expect(rules(run((s) => (note(s).note = `Uses it, ${word}.`)).errors)).toEqual([16]);
    }
    expect(run((s) => (note(s).note = 'Uses \\(\\mathrm{DR}\\) only in maths.')).errors).toEqual([]);
    const caps = run((s) => (note(s).note = 'Uses SUVAT.'));
    expect(caps.errors).toEqual([]);
    expect(rules(caps.warnings)).toEqual([16]);
    expect(run((s) => (note(s).note = 'Shows LHS equals RHS, AG.')).warnings).toEqual([]);
    expect(rules(run((s) => (part(s, 2, '').rows[1].scheme = 'By www\n')).errors)).toEqual([16]);
  });

  it('rule 17: no special case anywhere', () => {
    expect(rules(run((s) => (note(s).note = 'Uses it. SC B1 for the answer.')).errors)).toEqual([17]);
    expect(rules(run((s) => (part(s, 3, 'a.i').alt.title = 'Special case')).errors)).toEqual([17]);
  });

  it('rule 18: an M1, dM1 or E1 note opens with a verb (a warning)', () => {
    const r = run((s) => (note(s).note = 'The integral between their limits.'));
    expect(r.errors).toEqual([]);
    expect(rules(r.warnings)).toEqual([18]);
    expect(run((s) => (part(s, 1, 'b').rows[1].marks[0].note = 'Correct.')).warnings).toEqual([]);
    for (const verb of ['Uses', 'Forms', 'Obtains', 'States', 'Finds', 'Attempts', 'Solves', 'Substitutes', 'Collects']) {
      expect(run((s) => (note(s).note = `${verb} the integral.`)).warnings, verb).toEqual([]);
    }
    expect(rules(run((s) => (note(s).note = 'Dependent on the previous method mark.')).warnings)).toEqual([18]);
  });

  it('rule 18: the verbs of matrices, transformations and limits open a note too', () => {
    for (const verb of ['Premultiplies', 'Postmultiplies', 'Reflects', 'Rotates', 'Inverts', 'Conjugates', 'Cancels', 'Minimises', 'Maximises', 'Links', 'Refers', 'Lets']) {
      expect(run((s) => (note(s).note = `${verb} the integral.`)).warnings, verb).toEqual([]);
    }
    expect(rules(run((s) => (note(s).note = 'Requires the integral.')).warnings)).toEqual([18]);
  });

  it('rule 19: a note of more than about 35 words (a warning)', () => {
    const long = `Uses ${'the method '.repeat(18)}here.`;
    const r = run((s) => (note(s).note = long));
    expect(r.errors).toEqual([]);
    expect(rules(r.warnings)).toEqual([19]);
    expect(run((s) => (note(s).note = `Uses ${'\\(x\\) '.repeat(30)}`)).warnings).toEqual([]);
  });
});

describe('rules 20-21: figures', () => {
  it("rule 20: figure N names one of the solution's counted pictures", () => {
    expect(rules(run((s) => (part(s, 1, 'a').rows[0].figure = 3)).errors)).toEqual([20]);
    const none = run((s) => (part(s, 2, '').rows[0] = { figure: 1, marks: [{ code: 'B1', feature: 'shape' }] }));
    expect(rules(none.errors)).toEqual([20]);
  });

  it('rule 21: a solution box defining something outside its pictures warns on each figure', () => {
    const r = run((s) => (part(s, 3, 'a.ii').rows[0] = { figure: 1, marks: [{ code: 'B1', feature: 'shape' }, { code: 'B1', feature: 'intercepts' }] }));
    expect(r.errors).toEqual([]);
    expect(rules(r.warnings)).toEqual([21]);
  });
});

describe('rules 23-24: flags and queries', () => {
  const flagged = (flag) => (s) => {
    const p = part(s, 1, 'b');
    delete p.rows;
    p.flag = flag;
  };

  it('accepts a flag and a query in a draft', () => {
    const r = run((s) => {
      flagged({ kind: 'solution_error', why: 'The last line drops a factor of 2.' })(s);
      part(s, 2, '').rows[1].marks[0].query = { code: 'B1', why: 'Nothing is derived here.' };
    }, { draft: true });
    expect(r.errors).toEqual([]);
  });

  it('rule 23: a known kind, a one-line why, and no rows or alt', () => {
    expect(rules(run(flagged({ kind: 'breakdown', why: 'x' }), { draft: true }).errors)).toEqual([23]);
    expect(rules(run(flagged({ kind: 'validation', why: 'x' }), { draft: true }).errors)).toEqual([23]);
    expect(rules(run(flagged({ kind: 'figure_missing', why: 'a\nb' }), { draft: true }).errors)).toEqual([23]);
    expect(rules(run(flagged({ kind: 'too_hard', why: 'x' }), { draft: true }).errors)).toEqual([23]);
    const withRows = run((s) => (part(s, 1, 'b').flag = { kind: 'solution_error', why: 'x' }), { draft: true });
    expect(rules(withRows.errors)).toEqual([23]);
  });

  it("rule 23: an answer never holds not_drafted; a query's code is on the list and differs", () => {
    const q = baseScheme().questions[0];
    q.parts[1] = { part: 'b', flag: { kind: 'not_drafted', why: 'Every attempt failed.' } };
    expect(rules(checkQuestion(q, PACK).errors)).toEqual([23]);
    expect(run(flagged({ kind: 'not_drafted', why: 'Every attempt failed.' }), { draft: true }).errors).toEqual([]);
    const same = run((s) => (part(s, 2, '').rows[1].marks[0].query = { code: 'M1', why: 'x' }), { draft: true });
    expect(rules(same.errors)).toEqual([23]);
    const bad = run((s) => (part(s, 2, '').rows[1].marks[0].query = { code: 'M2', why: 'x' }), { draft: true });
    expect(rules(bad.errors)).toEqual([23]);
    const twoLines = run((s) => (part(s, 2, '').rows[1].marks[0].query = { code: 'B1', why: 'a\nb' }), { draft: true });
    expect(rules(twoLines.errors)).toEqual([23]);
  });

  it('rule 24: a committed scheme holds no flag and no query', () => {
    expect(rules(run(flagged({ kind: 'solution_error', why: 'x' })).errors)).toEqual([24]);
    const query = run((s) => (part(s, 2, '').rows[1].marks[0].query = { code: 'B1', why: 'x' }));
    expect(rules(query.errors)).toEqual([24]);
  });
});

describe('checkQuestion: the accept', () => {
  it('runs rule 1 fields and types and rules 4-23 on one question, stamp optional', () => {
    const q = baseScheme().questions[1];
    delete q.stamp;
    expect(checkQuestion(q, PACK)).toEqual({ errors: [], warnings: [] });
    expect(rules(checkQuestion({ ...q, extra: 1 }, PACK).errors)).toEqual([1]);
    expect(rules(checkQuestion({ ...q, q: 9 }, PACK).errors)).toEqual([4]);
    q.parts[0].rows[2].marks = [];
    expect(rules(checkQuestion(q, PACK).errors)).toEqual([8]);
  });

  it('reports problems with the question and where they are', () => {
    const q = baseScheme().questions[0];
    delete q.parts[1].rows[0].marks[0].note;
    expect(checkQuestion(q, PACK).errors).toEqual([
      { rule: 15, where: 'Q1(b) row 1 mark 1', q: 1, message: 'M1 needs a note' },
    ]);
  });
});

describe('edits', () => {
  it('parses --only lists', () => {
    expect(parseOnly('3, 5')).toEqual([3, 5]);
    expect(parseOnly('3 5 3')).toEqual([3, 5]);
    expect(() => parseOnly('Q3')).toThrow();
    expect(() => parseOnly(' ')).toThrow();
  });

  it('splices questions, leaving every other one byte for byte', () => {
    const before = emitScheme(baseScheme());
    const incoming = baseScheme().questions[1];
    incoming.parts[0].rows[1].marks[0].note = 'Uses addition, once.';
    const after = emitScheme(spliceQuestions(parseYaml(before).value, [incoming], [2]));
    const q1 = (t) => t.slice(0, t.indexOf('  - q: 2\n'));
    const q3 = (t) => t.slice(t.indexOf('  - q: 3\n'));
    expect(q1(after)).toBe(q1(before));
    expect(q3(after)).toBe(q3(before));
    expect(after).toContain('Uses addition, once.');
    const added = spliceQuestions({ ...baseScheme(), questions: [baseScheme().questions[0], baseScheme().questions[2]] }, [incoming], [2]);
    expect(added.questions.map((q) => q.q)).toEqual([1, 2, 3]);
    expect(() => spliceQuestions(baseScheme(), [incoming], [3])).toThrow(/no question 3/);
  });

  it("stamps the named questions with the pack's stamp now", () => {
    const s = baseScheme();
    s.questions[0].stamp = '00000000';
    s.questions[1].stamp = '00000000';
    const out = stampQuestions(s, PACK, [1]);
    expect(out.questions.map((q) => q.stamp)).toEqual([stampOf(1), '00000000', stampOf(3)]);
    expect(() => stampQuestions(s, PACK, [7])).toThrow(/no question 7/);
    const extra = { ...s, questions: [...s.questions, { ...s.questions[0], q: 4 }] };
    expect(() => stampQuestions(extra, PACK, [4])).toThrow(/the pack has no question 4/);
  });

  it("renumbers a scheme into a reordered pack's order by stamp, the rest byte for byte", () => {
    const moved = packModel(qbtText([3, 1, 2]), solnText([3, 1, 2]));
    const before = emitScheme(baseScheme());
    const { scheme, moves } = renumberScheme(parseYaml(before).value, moved);
    expect(scheme.questions.map((q) => [q.q, q.stamp])).toEqual([
      [1, stampOf(3)],
      [2, stampOf(1)],
      [3, stampOf(2)],
    ]);
    expect(moves).toEqual([[1, 2], [2, 3], [3, 1]]);
    const after = emitScheme(scheme);
    const body = (t, q) => {
      const start = t.indexOf(`    stamp: ${stampOf(q)}\n`);
      const next = t.indexOf('  - q: ', start);
      return t.slice(start, next < 0 ? undefined : next);
    };
    for (const q of [1, 2, 3]) expect(body(after, q)).toBe(body(before, q));
    expect(checkScheme(after, moved, { today: TODAY }).errors).toEqual([]);
  });

  it('refuses to renumber when a stamp matches no question, or more than one', () => {
    const edited = { ...STATEMENTS, 1: STATEMENTS[1].replace('Sketch', 'Draw') };
    const pack = packModel(qbtText([3, 1, 2], edited), solnText([3, 1, 2], edited));
    expect(() => renumberScheme(baseScheme(), pack)).toThrow(/Q1 \(stamp [0-9a-f]{8}\) matches no question/);
    const twice = { ...STATEMENTS, 3: STATEMENTS[2] };
    const doubled = packModel(qbtText([1, 2, 3], twice), solnText([1, 2, 3], twice, { ...SOLUTIONS, 3: SOLUTIONS[2] }));
    const s = baseScheme();
    s.questions[2].stamp = stampOf(2);
    expect(() => renumberScheme(s, doubled)).toThrow(/matches questions 2 and 3/);
  });

  it('reports each question broken or stale', () => {
    const s = baseScheme();
    s.questions[1].stamp = '00000000';
    delete part(s, 3, 'b').rows[0].marks[0].note;
    const status = schemeStatus(emitScheme(s), PACK, { today: TODAY });
    expect(status).toMatchObject({ fileErrors: [], broken: [3], stale: [2] });
  });

  it('lists what a writer cannot write', () => {
    expect(writableProblems(baseScheme())).toEqual([]);
    const s = baseScheme();
    s.questions[0].parts[1].rows[0].marks[0].note = 'a\bb';
    expect(rules(writableProblems(s))).toEqual([6]);
    expect(rules(writableProblems({ ...baseScheme(), extra: 1 }))).toEqual([1]);
  });
});
