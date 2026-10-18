import { describe, expect, it } from 'vitest';
import {
  PACK_PREAMBLE_OVERLEAF_INPUT,
  PACK_PREAMBLE_SITE_INPUT,
  SCHEME_PREAMBLE_SITE_INPUT,
  checkPackPreambleConvention,
  checkSchemePreambleConvention,
  isFurtherMathsSchemeTexFile,
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
  hasMechanicsPack,
  isFurtherMechanicsPackPath,
  checkPackPreambleComments,
  stripPreambleComments,
  preambleCommentLines,
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

  it('escapes a backslash, tilde and caret as text symbols', () => {
    expect(texEscapeText(String.raw`Back\slash ~ Caret ^`)).toBe(
      String.raw`Back\textbackslash{}slash \textasciitilde{} Caret \textasciicircum{}`,
    );
    const title = String.raw`a\b ~c^ {\} 100% \&`;
    expect(texUnescapeText(texEscapeText(title))).toBe(title);
  });

  it('round-trips such a title through the header', () => {
    const title = String.raw`Tilde ~ Caret ^ Back\slash`;
    const out = applyPackIdentity(dated(), { title, strand: 'Core Pure', section: 'Vectors' });
    expect(readPackIdentity(out).title).toBe(title);
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

describe('\\djsMechanicsPack', () => {
  const MECH_REL = HYPHEN_REL;
  const mech = (rel) => migratePackPreamble(oldInline('qbt', 'Work-Energy Principle'), rel, '1 October 2026');
  const withCall = (text) => text.replace('\\djsLastUpdated', '\\djsMechanicsPack\n\\djsLastUpdated');

  it('is found in preamble code only', () => {
    expect(hasMechanicsPack(withCall(mech(MECH_REL)))).toBe(true);
    expect(hasMechanicsPack(mech(MECH_REL))).toBe(false);
    expect(hasMechanicsPack(mech(MECH_REL).replace('\\begin{document}', '% \\djsMechanicsPack\n\\begin{document}'))).toBe(false);
    expect(hasMechanicsPack(mech(MECH_REL).replace('\\djsFrontMatter', '\\djsFrontMatter\n\\djsMechanicsPack'))).toBe(false);
    expect(hasMechanicsPack('\\djsMechanicsPackage\n\\begin{document}')).toBe(false);
  });

  it('survives migrating a legacy preamble', () => {
    const legacy = oldInline('qbt', 'Work-Energy Principle').replace('\\begin{document}', '\\djsMechanicsPack\n\\begin{document}');
    expect(hasMechanicsPack(migratePackPreamble(legacy, MECH_REL))).toBe(true);
    expect(hasMechanicsPack(migratePackPreamble(oldInline(), QBT_REL))).toBe(false);
  });

  it('is required in Further Mechanics packs and refused elsewhere', () => {
    const kinds = (text, rel) => checkPackPreambleConvention(text, rel).map((v) => v.kind);
    expect(isFurtherMechanicsPackPath(MECH_REL)).toBe(true);
    expect(isFurtherMechanicsPackPath(QBT_REL)).toBe(false);
    expect(kinds(withCall(mech(MECH_REL)), MECH_REL)).toEqual([]);
    expect(kinds(mech(MECH_REL), MECH_REL)).toEqual(['missing-mechanics-pack']);
    const pure = migratePackPreamble(oldInline(), QBT_REL, '1 October 2026');
    expect(kinds(withCall(pure), QBT_REL)).toEqual(['stray-mechanics-pack']);
  });
});

describe('preamble comments', () => {
  const dated = () => migratePackPreamble(oldInline(), QBT_REL, '1 October 2026');

  it('are refused by their own check, with their line numbers', () => {
    expect(checkPackPreambleComments(dated(), QBT_REL)).toEqual([]);
    const commented = `% top\n${dated().replace('\\begin{document}', '  % note\n\\begin{document}')}`;
    expect(checkPackPreambleComments(commented, QBT_REL)).toEqual([
      { kind: 'preamble-comment', message: `${QBT_REL}: full-line comment before \\begin{document} (line 1, 8)` },
    ]);
    expect(checkPackPreambleComments(commented, 'public/tex/tmua/TMUA_SetA_Paper1.tex')).toEqual([]);
  });

  it('are stripped, keeping body comments, trailing comments and line endings', () => {
    const source = `% top\r\n\\documentclass{article} % keep\r\n  % note\r\n\\begin{document}\r\n% body\r\n\\end{document}\r\n`;
    expect(stripPreambleComments(source)).toBe(
      `\\documentclass{article} % keep\r\n\\begin{document}\r\n% body\r\n\\end{document}\r\n`,
    );
    expect(preambleCommentLines(source)).toEqual([1, 3]);
  });
});

describe('the mark scheme wrapper', () => {
  const MS_REL = 'public/tex/further-maths/core-pure/polar-coordinates/ms/_QBT___MS__Integration_of_Polar_Curves.tex';
  const scheme = [
    String.raw`\documentclass[leqno]{article}`,
    SCHEME_PREAMBLE_SITE_INPUT,
    '',
    String.raw`\djsSchemeHeader{Integration of Polar Curves}`,
    String.raw`\djsSitePath{Core Pure}{Polar Coordinates}`,
    '',
    String.raw`\djsLastUpdated{18 October 2026}`,
    String.raw`\begin{document}`,
    String.raw`\msQuestion{1}`,
    String.raw`\end{document}`,
    '',
  ].join('\n');
  const kinds = (text, rel = MS_REL) => [
    ...checkSchemePreambleConvention(text, rel),
    ...checkPackPreambleComments(text, rel),
  ].map((v) => v.kind);

  it('recognises a scheme\'s rendered .tex, and only that, as a scheme', () => {
    expect(isFurtherMathsSchemeTexFile(MS_REL)).toBe(true);
    expect(isFurtherMathsSchemeTexFile(QBT_REL)).toBe(false);
    expect(isFurtherMathsSchemeTexFile(MS_REL.replace('/ms/', '/ms/build/'))).toBe(false);
    expect(isFurtherMathsPackTexFile(MS_REL)).toBe(false);
    expect(checkPackPreambleConvention(scheme, MS_REL)).toEqual([]);
    expect(checkSchemePreambleConvention(scheme, QBT_REL)).toEqual([]);
  });

  it('accepts the wrapper the renderer writes', () => {
    expect(kinds(scheme)).toEqual([]);
    expect(readPackIdentity(scheme)).toEqual({
      title: 'Integration of Polar Curves',
      sitePath: { strand: 'Core Pure', section: 'Polar Coordinates' },
    });
  });

  it('refuses a scheme at the wrong depth, on the wrong preamble, or with a pack header', () => {
    expect(kinds(scheme, 'public/tex/further-maths/core-pure/ms/_QBT___MS__X.tex')).toContain('bad-depth');
    expect(kinds(scheme.replace('markscheme_preamble', 'pack_preamble'))).toEqual(
      expect.arrayContaining(['missing-scheme-input', 'pack-input-in-scheme']),
    );
    expect(kinds(scheme.replace('djsSchemeHeader', 'djsQbtHeader'))).toContain('bad-header');
    expect(kinds(scheme.replace(String.raw`\djsLastUpdated{18 October 2026}`, ''))).toContain('bad-last-updated');
    expect(kinds(scheme.replace('\n\n\\djsLastUpdated', '\n\\djsMechanicsPack\n\\djsLastUpdated'))).toContain(
      'stray-mechanics-pack',
    );
    expect(kinds(scheme.replace('\n\n\\djsLastUpdated', '\n\\usepackage{xcolor}\n\\djsLastUpdated'))).toContain(
      'duplicated-preamble',
    );
    expect(kinds(`% rendered\n${scheme}`)).toContain('preamble-comment');
  });
});
