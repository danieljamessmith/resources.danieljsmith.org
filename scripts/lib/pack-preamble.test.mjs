import { describe, expect, it } from 'vitest';
import {
  PACK_PREAMBLE_OVERLEAF_INPUT,
  PACK_PREAMBLE_SITE_INPUT,
  checkPackPreambleConvention,
  formatPackDate,
  hasExpectedFurtherMathsPackDepth,
  isFurtherMathsPackTexFile,
  initialisePackDate,
  isValidPackDate,
  migratePackPreamble,
  normalizeImportedPackTex,
  applyPackIdentity,
  readPackIdentity,
  texEscapeText,
  texUnescapeText,
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

describe('pack last-updated dates', () => {
  it('formats dates without depending on the locale and validates leap days', () => {
    expect(formatPackDate(new Date(2026, 9, 5))).toBe('5 October 2026');
    expect(isValidPackDate('29 February 2024')).toBe(true);
    for (const value of ['29 February 2026', '31 April 2026', '5 october 2026', '', null]) {
      expect(isValidPackDate(value)).toBe(false);
    }
  });

  it('initialises undated imports and preserves their body and line endings', () => {
    const source = migratePackPreamble(oldInline(), QBT_REL, '1 October 2026')
      .replace('\\djsLastUpdated{1 October 2026}\n', '').replaceAll('\n', '\r\n');
    const out = initialisePackDate(source, '5 October 2026');
    expect(out.replace('\\djsLastUpdated{5 October 2026}\r\n', '')).toBe(source);
    expect(checkPackPreambleConvention(out, QBT_REL)).toEqual([]);
  });

  it('keeps an existing date through both import forms and legacy migration', () => {
    const dated = migratePackPreamble(oldInline(), QBT_REL, '1 October 2026');
    for (const source of [dated, dated.replace(PACK_PREAMBLE_SITE_INPUT, PACK_PREAMBLE_OVERLEAF_INPUT)]) {
      expect(normalizeImportedPackTex(source, QBT_REL, '5 October 2026')).toBe(dated);
    }
    const legacy = oldInline().replace('\\begin{document}', '\\djsLastUpdated{1 October 2026}\n\\begin{document}');
    expect(migratePackPreamble(legacy, QBT_REL, '5 October 2026')).toBe(dated);
  });

  it('refuses missing, duplicate, invalid and body-only dates while ignoring comments', () => {
    const dated = migratePackPreamble(oldInline(), QBT_REL, '1 October 2026');
    const call = '\\djsLastUpdated{1 October 2026}';
    const undated = dated.replace(`${call}\n`, '');
    for (const source of [
      undated,
      dated.replace(call, `${call}\n${call}`),
      dated.replace(call, '\\djsLastUpdated{31 April 2026}'),
      undated.replace('\\begin{document}', `\\begin{document}\n${call}`),
      dated.replace(call, '% ' + call),
    ]) {
      expect(checkPackPreambleConvention(source, QBT_REL).map((v) => v.kind)).toContain('bad-last-updated');
    }
    expect(checkPackPreambleConvention(`% ${call}\n${dated}`, QBT_REL)).toEqual([]);
    expect(() => initialisePackDate(dated.replace(call, `${call}\n${call}`))).toThrow(/one valid/);
    expect(() => initialisePackDate(undated, '31 April 2026')).toThrow(/invalid pack date/);
  });
});

describe('pack identity: header title and site path', () => {
  const dated = () => migratePackPreamble(oldInline('qbt', 'Old Title'), QBT_REL, '1 October 2026');

  it('escapes and unescapes the characters titles use', () => {
    expect(texEscapeText('Momentum & Collisions, 50% #1')).toBe(String.raw`Momentum \& Collisions, 50\% \#1`);
    expect(texUnescapeText(texEscapeText('a & b_c {d} $e'))).toBe('a & b_c {d} $e');
  });

  it('renames the header and adds the site path on the line after it', () => {
    const out = applyPackIdentity(dated(), {
      title: 'Matrix Determinants & Inverses',
      strand: 'Core Pure',
      section: 'Vectors, Matrices & Linear Transformations',
    });
    const lines = out.split('\n');
    const header = lines.indexOf(String.raw`\djsQbtHeader{Matrix Determinants \& Inverses}`);
    expect(header).toBeGreaterThan(0);
    expect(lines[header + 1]).toBe(
      String.raw`\djsSitePath{Core Pure}{Vectors, Matrices \& Linear Transformations}`,
    );
    expect(readPackIdentity(out)).toEqual({
      title: 'Matrix Determinants & Inverses',
      sitePath: { strand: 'Core Pure', section: 'Vectors, Matrices & Linear Transformations' },
    });
    expect(checkPackPreambleConvention(out, QBT_REL)).toEqual([]);
  });

  it('replaces an earlier site path, keeps line endings and can leave the header alone', () => {
    const crlf = applyPackIdentity(dated(), { strand: 'Core Pure', section: 'Old' }).replaceAll('\n', '\r\n');
    const out = applyPackIdentity(crlf, { strand: 'Core Pure', section: 'Further Calculus' });
    expect(out.match(/\\djsSitePath/g)).toHaveLength(1);
    expect(out).toContain('\\djsSitePath{Core Pure}{Further Calculus}\r\n');
    expect(out).not.toMatch(/(?<!\r)\n/);
    expect(readPackIdentity(out).title).toBe('Old Title');
  });

  it('reads a solutions header and a pack without a site path', () => {
    const soln = migratePackPreamble(oldInline('soln'), SOLN_REL, '1 October 2026');
    expect(readPackIdentity(soln)).toEqual({ title: 'Maclaurin Series', sitePath: null });
  });

  it('sets the identity of an imported pack when given one', () => {
    const out = normalizeImportedPackTex(oldInline('qbt', 'Overleaf Name'), QBT_REL, '5 October 2026', {
      title: 'Site Name',
      strand: 'Core Pure',
      section: 'Further Calculus',
    });
    expect(readPackIdentity(out)).toEqual({
      title: 'Site Name',
      sitePath: { strand: 'Core Pure', section: 'Further Calculus' },
    });
  });

  it('refuses duplicate, body-only and incomplete site paths', () => {
    const call = '\\djsSitePath{Core Pure}{Further Calculus}';
    const base = dated();
    for (const source of [
      base.replace('\\begin{document}', `${call}\n${call}\n\\begin{document}`),
      base.replace('\\djsFrontMatter', `\\djsFrontMatter\n${call}`),
      base.replace('\\begin{document}', '\\djsSitePath{Core Pure}{}\n\\begin{document}'),
      base.replace('\\begin{document}', '\\djsSitePath{Core Pure}\n\\begin{document}'),
    ]) {
      expect(checkPackPreambleConvention(source, QBT_REL).map((v) => v.kind)).toContain('bad-site-path');
    }
    expect(checkPackPreambleConvention(`% ${call}\n${base}`, QBT_REL)).toEqual([]);
  });

  it('refuses a pack without a header', () => {
    const headerless = dated().replace(/\\djsQbtHeader\{[^}]*\}\n/, '');
    expect(() => applyPackIdentity(headerless, { title: 'T' })).toThrow(/missing \\djsQbtHeader/);
  });
});
