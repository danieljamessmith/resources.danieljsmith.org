import { describe, expect, it } from 'vitest';
import {
  PACK_PREAMBLE_OVERLEAF_INPUT,
  PACK_PREAMBLE_SITE_INPUT,
  checkPackPreambleConvention,
  hasExpectedFurtherMathsPackDepth,
  isFurtherMathsPackTexFile,
  migratePackPreamble,
  normalizeImportedPackTex,
} from './pack-preamble.mjs';

const QBT_REL =
  'public/tex/further-maths/core-pure/further-calculus/qbt/_QBT__Maclaurin_Series.tex';
const SOLN_REL =
  'public/tex/further-maths/core-pure/further-calculus/soln/_QBT___Solns__Maclaurin_Series.tex';
const HYPHEN_REL =
  'public/tex/further-maths/further-mechanics/work-energy-power/qbt/_QBT__Work_Energy_Principle.tex';

function oldInline(kind = 'qbt', title = 'Maclaurin Series') {
  const lhead =
    kind === 'soln'
      ? String.raw`\lhead{\textit{Solutions} - ${title}}`
      : String.raw`\lhead{${title}}`;
  return [
    String.raw`\documentclass[leqno]{article}`,
    String.raw`\usepackage{amsmath}`,
    String.raw`\usepackage[colorlinks=true,linkcolor=red,citecolor=magenta,urlcolor=black]{hyperref}%`,
    String.raw`\newcommand{\questionitem}{\item}`,
    lhead,
    String.raw`\begin{document}`,
    String.raw`\vspace*{20pt}`,
    String.raw`\tableofcontents`,
    String.raw`\newpage`,
    String.raw`\begin{enumerate}[`,
    '  label=\\textbf{\\arabic*.}',
    ']',
    String.raw`\questionitem`,
    'Body',
    String.raw`\end{enumerate}`,
    String.raw`\end{document}`,
    '',
  ].join('\n');
}

describe('pack preamble path helpers', () => {
  it('detects Further Maths qbt/soln pack files only', () => {
    expect(isFurtherMathsPackTexFile(QBT_REL)).toBe(true);
    expect(isFurtherMathsPackTexFile(SOLN_REL)).toBe(true);
    expect(isFurtherMathsPackTexFile('public/tex/tmua/paper/qbt/_QBT__T.tex')).toBe(false);
    expect(isFurtherMathsPackTexFile('public/tex/further-maths/core-pure/t/notes/n.tex')).toBe(false);
  });

  it('enforces the fixed-depth convention', () => {
    expect(hasExpectedFurtherMathsPackDepth(QBT_REL)).toBe(true);
    expect(
      hasExpectedFurtherMathsPackDepth(
        'public/tex/further-maths/core-pure/extra/topic/qbt/_QBT__T.tex',
      ),
    ).toBe(false);
  });
});

describe('migratePackPreamble', () => {
  it('converts an inline QBT preamble to the shared wrapper', () => {
    const out = migratePackPreamble(oldInline('qbt', 'Work-Energy Principle'), HYPHEN_REL);

    expect(out).toContain(PACK_PREAMBLE_SITE_INPUT);
    expect(out).toContain(String.raw`\djsQbtHeader{Work-Energy Principle}`);
    expect(out).toContain(String.raw`\djsFrontMatter`);
    expect(out).not.toContain(String.raw`\usepackage{amsmath}`);
    expect(out.indexOf(String.raw`\djsFrontMatter`)).toBeLessThan(
      out.indexOf(String.raw`\begin{enumerate}`),
    );
  });

  it('strips the old solutions header prefix for Soln wrappers', () => {
    const out = migratePackPreamble(oldInline('soln'), SOLN_REL);

    expect(out).toContain(String.raw`\djsSolnHeader{Maclaurin Series}`);
    expect(out).not.toContain(String.raw`\textit{Solutions} - Maclaurin Series}`);
  });
});

describe('normalizeImportedPackTex', () => {
  it('rewrites flat Overleaf imports to the site shared import', () => {
    const tex = [
      String.raw`\documentclass[leqno]{article}`,
      PACK_PREAMBLE_OVERLEAF_INPUT,
      String.raw`\djsQbtHeader{T}`,
      String.raw`\begin{document}`,
      String.raw`\djsFrontMatter`,
      String.raw`\begin{enumerate}`,
      String.raw`\end{enumerate}`,
      String.raw`\end{document}`,
    ].join('\n');

    const out = normalizeImportedPackTex(tex, QBT_REL);
    expect(out).toContain(PACK_PREAMBLE_SITE_INPUT);
    expect(out).not.toContain(PACK_PREAMBLE_OVERLEAF_INPUT);
  });
});

describe('checkPackPreambleConvention', () => {
  it('accepts a migrated QBT file', () => {
    const tex = migratePackPreamble(oldInline(), QBT_REL);
    expect(checkPackPreambleConvention(tex, QBT_REL)).toEqual([]);
  });

  it('reports inline preamble remnants and wrong header macro', () => {
    const tex = [
      String.raw`\documentclass[leqno]{article}`,
      PACK_PREAMBLE_SITE_INPUT,
      String.raw`\usepackage{amsmath}`,
      String.raw`\djsSolnHeader{Maclaurin Series}`,
      String.raw`\begin{document}`,
      String.raw`\djsFrontMatter`,
      String.raw`\begin{enumerate}`,
      String.raw`\end{enumerate}`,
      String.raw`\end{document}`,
    ].join('\n');

    const kinds = checkPackPreambleConvention(tex, QBT_REL).map((v) => v.kind);
    expect(kinds).toContain('wrong-header');
    expect(kinds).toContain('duplicated-preamble');
  });
});
