import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  parseBoardSelection,
  parseBoardsFlag,
  parseSitePathArg,
  resolveSection,
  resourceIdProblem,
  usesIncludeGraphics,
  mechanicsPackProblem,
  compileFailureSummary,
  prepareImportedTex,
  parseImportArgs,
  missingForYes,
  sanitizeTopic,
  findPackTex,
  tryFindPackTex,
  resolveTexPairFromClone,
  copyNormalizedPackTex,
  parseSource,
  readPackManifest,
  resolveTexPairFromDir,
  promptTopic,
  importedPackIdentity,
  PACK_MANIFEST,
  GENERATED_FILES,
  preparePackPair,
  prepareScheme,
  findSchemeFile,
  schemeFileName,
  runImport,
} from './import-pack.mjs';
import { emitScheme, packModel } from './lib/markscheme.mjs';
import { PACK_PREAMBLE_SITE_INPUT, readPackIdentity } from './lib/pack-preamble.mjs';
import { bodyCommentViolations, isUnexpectedFullLineComment } from './check-tex.mjs';
import { syncPair } from './lib/question-blocks.mjs';
import { parseResourcesEntries } from './lib/resources-derive.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

/** The two strands' board lists, as `EXAM_BOARDS` and `FM_MECH_EXAM_BOARDS` give them. */
const CP_BOARDS = ['edexcel', 'aqa', 'ocr-a', 'ocr-mei', 'cie-9231'];
const MECH_BOARDS = [
  'edexcel-fm1',
  'edexcel-fm2',
  'aqa',
  'ocr-a',
  'ocr-mei-mechanics-minor',
  'ocr-mei-mechanics-major',
  'cie-9231',
];

// ---------------------------------------------------------------------------
// parseBoardSelection
// ---------------------------------------------------------------------------

describe('parseBoardSelection', () => {
  it('returns null boardIds for empty input (all boards)', () => {
    expect(parseBoardSelection('', CP_BOARDS)).toEqual({ ok: true, boardIds: null });
    expect(parseBoardSelection('   ', MECH_BOARDS)).toEqual({ ok: true, boardIds: null });
  });

  it('returns null boardIds when option 1 is selected alone', () => {
    expect(parseBoardSelection('1', CP_BOARDS)).toEqual({ ok: true, boardIds: null });
  });

  it("numbers the strand's own boards from 2, in its order", () => {
    expect(parseBoardSelection('2', CP_BOARDS)).toEqual({ ok: true, boardIds: ['edexcel'] });
    expect(parseBoardSelection('3', CP_BOARDS)).toEqual({ ok: true, boardIds: ['aqa'] });
    expect(parseBoardSelection('4', CP_BOARDS)).toEqual({ ok: true, boardIds: ['ocr-a'] });
    expect(parseBoardSelection('5', CP_BOARDS)).toEqual({ ok: true, boardIds: ['ocr-mei'] });
    expect(parseBoardSelection('6', CP_BOARDS)).toEqual({ ok: true, boardIds: ['cie-9231'] });
    expect(parseBoardSelection('2', MECH_BOARDS)).toEqual({ ok: true, boardIds: ['edexcel-fm1'] });
    expect(parseBoardSelection('8', MECH_BOARDS)).toEqual({ ok: true, boardIds: ['cie-9231'] });
  });

  it('returns multiple board IDs for a comma-separated selection', () => {
    const result = parseBoardSelection('2,3', CP_BOARDS);
    expect(result).toEqual({ ok: true, boardIds: ['edexcel', 'aqa'] });
  });

  it('deduplicates repeated selections', () => {
    const result = parseBoardSelection('2,2,3', CP_BOARDS);
    expect(result).toEqual({ ok: true, boardIds: ['edexcel', 'aqa'] });
  });

  it('accepts space-separated input', () => {
    const result = parseBoardSelection('3 6', MECH_BOARDS);
    expect(result).toEqual({ ok: true, boardIds: ['edexcel-fm2', 'ocr-mei-mechanics-minor'] });
  });

  it('returns an error when option 1 is combined with others', () => {
    const result = parseBoardSelection('1,2', CP_BOARDS);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/cannot be combined/i);
  });

  it("returns an error for a number past the strand's list", () => {
    expect(parseBoardSelection('7', CP_BOARDS).message).toMatch(/between 1 and 6/i);
    expect(parseBoardSelection('9', MECH_BOARDS).message).toMatch(/between 1 and 8/i);
  });

  it('returns an error for non-numeric input', () => {
    const result = parseBoardSelection('abc', CP_BOARDS);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

describe('parseBoardsFlag', () => {
  it('takes all for every board', () => {
    expect(parseBoardsFlag('all', MECH_BOARDS)).toEqual({ ok: true, boardIds: null });
    expect(parseBoardsFlag(' ALL ', CP_BOARDS)).toEqual({ ok: true, boardIds: null });
  });

  it("returns the strand's boards in the strand's order, once each", () => {
    expect(parseBoardsFlag('cie-9231,edexcel-fm2 aqa,aqa', MECH_BOARDS)).toEqual({
      ok: true,
      boardIds: ['edexcel-fm2', 'aqa', 'cie-9231'],
    });
  });

  it("refuses a board from another strand's list, naming this strand's boards", () => {
    const result = parseBoardsFlag('edexcel,ocr-mei', MECH_BOARDS);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/edexcel, ocr-mei/);
    expect(result.message).toMatch(/edexcel-fm1/);
    expect(parseBoardsFlag('edexcel-fm1', CP_BOARDS).ok).toBe(false);
  });

  it('refuses an empty value', () => {
    expect(parseBoardsFlag(' , ', CP_BOARDS).ok).toBe(false);
  });
});

describe('parseSitePathArg', () => {
  it('reads a strand folder and a section folder', () => {
    expect(parseSitePathArg('core-pure/induction')).toEqual({
      ok: true,
      strandFolder: 'core-pure',
      sectionFolder: 'induction',
    });
    expect(parseSitePathArg('further-maths\\further-mechanics\\centre-of-mass\\')).toEqual({
      ok: true,
      strandFolder: 'further-mechanics',
      sectionFolder: 'centre-of-mass',
    });
  });

  it('refuses anything but two folder names', () => {
    for (const value of ['core-pure', 'core-pure/induction/qbt', 'core-pure/..', '', '/']) {
      expect(parseSitePathArg(value).ok).toBe(false);
    }
  });
});

describe('parseImportArgs and missingForYes', () => {
  it('reads every flag', () => {
    const opts = parseImportArgs([
      '--folder', 'p', '--site-path', 'core-pure/induction', '--section', 'S',
      '--title', 'T', '--boards', 'all', '--id', 'fm-x', '--yes',
    ]);
    expect(opts).toMatchObject({
      folder: 'p', 'site-path': 'core-pure/induction', section: 'S',
      title: 'T', boards: 'all', id: 'fm-x', yes: true,
    });
    expect(missingForYes(opts)).toEqual([]);
  });

  it('lists what --yes still needs; --section is checked against the folder later', () => {
    expect(missingForYes(parseImportArgs(['--yes', '--title', ' ', '--boards', 'all']))).toEqual([
      'folder', 'site-path', 'title', 'id',
    ]);
  });

  it('refuses an unknown flag', () => {
    expect(() => parseImportArgs(['--topic', 'T'])).toThrow(/topic/);
  });
});

// ---------------------------------------------------------------------------
// Section, id and document checks
// ---------------------------------------------------------------------------

describe('resolveSection', () => {
  const strand = {
    category: 'FM - Core Pure',
    title: 'Core Pure',
    topics: [
      { id: 'proof-by-induction', topic: 'Proof by Induction', title: 'Proof by Induction' },
      { id: 'vectors', topic: 'Vectors', title: 'Vectors, Matrices & Linear Transformations' },
    ],
  };
  const folder = 'core-pure/induction';

  it("takes the section the folder's packs are filed under, whatever the folder is called", () => {
    const packRows = [{ topic: 'Proof by Induction' }, { topic: 'Proof by Induction' }];
    expect(resolveSection({ strand, folder, packRows })).toEqual({ ok: true, topic: 'Proof by Induction' });
    expect(resolveSection({ strand, folder, packRows, sectionArg: 'Proof by Induction' }).ok).toBe(true);
  });

  it("refuses a --section that disagrees with the folder's packs", () => {
    const result = resolveSection({ strand, folder, packRows: [{ topic: 'Proof by Induction' }], sectionArg: 'Vectors' });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/filed under "Proof by Induction"/);
  });

  it('needs --section for a folder with no pack yet, by topic or heading', () => {
    const missing = resolveSection({ strand, folder, packRows: [] });
    expect(missing).toMatchObject({ ok: false, needsSection: true });
    expect(missing.message).toMatch(/--section/);
    expect(resolveSection({ strand, folder, packRows: [], sectionArg: 'Vectors' })).toEqual({ ok: true, topic: 'Vectors' });
    expect(
      resolveSection({ strand, folder, packRows: [], sectionArg: 'Vectors, Matrices & Linear Transformations' }),
    ).toEqual({ ok: true, topic: 'Vectors' });
  });

  it('refuses a section topics.ts does not have', () => {
    const result = resolveSection({ strand, folder, packRows: [], sectionArg: 'Polar Coordinates' });
    expect(result.ok).toBe(false);
    expect(result.needsSection).toBeUndefined();
    expect(result.message).toMatch(/not a Core Pure section/);
  });

  it('refuses a folder whose packs are filed under two sections, or an unlisted one', () => {
    expect(resolveSection({ strand, folder, packRows: [{ topic: 'Vectors' }, { topic: 'Proof by Induction' }] }).ok).toBe(false);
    expect(resolveSection({ strand, folder, packRows: [{ topic: 'Induction' }] }).ok).toBe(false);
  });
});

describe('resourceIdProblem', () => {
  it('accepts lowercase kebab ids', () => {
    expect(resourceIdProblem('fm-induction-series')).toBeNull();
  });

  it('refuses other shapes and a solutions id', () => {
    for (const id of ['FM-x', 'fm x', 'fm--x', '-fm', "fm-de-moivre's"]) {
      expect(resourceIdProblem(id)).toMatch(/lowercase/);
    }
    expect(resourceIdProblem('fm-x-solns')).toMatch(/-solns/);
  });
});

describe('usesIncludeGraphics', () => {
  it('finds an image include in code, not in a comment', () => {
    expect(usesIncludeGraphics('a\n\\includegraphics[width=3cm]{fig.png}\n')).toBe(true);
    expect(usesIncludeGraphics('a\n% \\includegraphics{fig.png}\n')).toBe(false);
    expect(usesIncludeGraphics('50\\% \\includegraphics{fig.png}')).toBe(true);
  });
});

describe('compileFailureSummary', () => {
  it("leads with the log's file:line errors and the source line after each", () => {
    const log = [
      '(./_QBT__X.tex',
      './_QBT__X.tex:12: Undefined control sequence.',
      'l.12 \\undefinedmacro',
      '',
      'The control sequence at the end of the top line',
    ].join('\r\n');
    expect(compileFailureSummary(log, 'Latexmk: Errors')).toBe(
      './_QBT__X.tex:12: Undefined control sequence.\nl.12 \\undefinedmacro',
    );
  });

  it("falls back to the tail of latexmk's output", () => {
    const output = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    expect(compileFailureSummary('', output).split('\n')).toHaveLength(30);
    expect(compileFailureSummary('no errors here', output)).toMatch(/line 39$/);
  });
});

describe('mechanicsPackProblem', () => {
  const preamble = (extra) => `\\documentclass{article}\n${extra}\n\\begin{document}\n\\end{document}\n`;
  const withIt = { name: 'Q.tex', text: preamble('\\djsMechanicsPack') };
  const without = { name: 'S.tex', text: preamble('% \\djsMechanicsPack') };

  it('needs \\djsMechanicsPack in both documents of a Further Mechanics pack', () => {
    expect(mechanicsPackProblem([withIt, { ...withIt, name: 'S.tex' }], true)).toBeNull();
    expect(mechanicsPackProblem([withIt, without], true)).toMatch(/S\.tex does not/);
  });

  it('refuses it anywhere else', () => {
    expect(mechanicsPackProblem([without, { ...without, name: 'Q.tex' }], false)).toBeNull();
    expect(mechanicsPackProblem([withIt, without], false)).toMatch(/remove it from Q\.tex/);
  });
});

// ---------------------------------------------------------------------------
// sanitizeTopic
// ---------------------------------------------------------------------------

describe('sanitizeTopic', () => {
  it('replaces spaces with underscores', () => {
    expect(sanitizeTopic('Matrix Determinants')).toBe('Matrix_Determinants');
  });

  it('replaces non-alphanumeric characters', () => {
    expect(sanitizeTopic('Complex Numbers & Geometry')).toBe(
      'Complex_Numbers___Geometry',
    );
  });

  it('leaves alphanumeric characters untouched', () => {
    expect(sanitizeTopic('VectorsABC123')).toBe('VectorsABC123');
  });

  it('handles an already-clean string', () => {
    expect(sanitizeTopic('Matrices')).toBe('Matrices');
  });
});

// ---------------------------------------------------------------------------
// findPackTex / resolveTexPairFromClone
// ---------------------------------------------------------------------------

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'deploy-test-'));
}

describe('findPackTex', () => {
  const topic = 'Matrix Determinants & Inverses';

  it('finds both kinds in a unified project (exact names)', () => {
    const dir = tempDir();
    try {
      const q = `(QBT) ${topic}.tex`;
      const s = `(QBT) [Solns] ${topic}.tex`;
      writeFileSync(join(dir, q), '\\begin{document}\n\\end{document}\n');
      writeFileSync(join(dir, s), '\\begin{document}\n\\end{document}\n');

      const qbt = findPackTex(dir, 'qbt', topic);
      const soln = findPackTex(dir, 'soln', topic);
      expect(qbt.endsWith(q)).toBe(true);
      expect(soln.endsWith(s)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tier-3 legacy: single .tex with document', () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, 'main.tex'), '\\begin{document}\n\\end{document}\n');
      const q = findPackTex(dir, 'qbt', topic);
      const s = findPackTex(dir, 'soln', topic);
      expect(q).toBe(s);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when multiple candidates remain for a kind', () => {
    const dir = tempDir();
    try {
      writeFileSync(
        join(dir, '(QBT) A.tex'),
        '\\begin{document}\n\\end{document}\n',
      );
      writeFileSync(
        join(dir, '(QBT) B.tex'),
        '\\begin{document}\n\\end{document}\n',
      );
      expect(() => findPackTex(dir, 'qbt', topic)).toThrow(/Ambiguous/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('tryFindPackTex', () => {
  it('returns null when the kind is missing', () => {
    const dir = tempDir();
    try {
      writeFileSync(
        join(dir, '(QBT) [Solns] Only.tex'),
        '\\begin{document}\n\\end{document}\n',
      );
      expect(tryFindPackTex(dir, 'qbt', 'Only')).toBeNull();
      expect(tryFindPackTex(dir, 'soln', 'Only')).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveTexPairFromClone', () => {
  it('splits same-path tier-3 into a single kind (defaults to questions missing soln)', () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, 'main.tex'), '\\begin{document}\n\\end{document}\n');
      const r = resolveTexPairFromClone(dir, 'X');
      expect(r.qbtPath).not.toBeNull();
      expect(r.solnPath).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// copyNormalizedPackTex
// ---------------------------------------------------------------------------

describe('copyNormalizedPackTex', () => {
  it('rewrites flat Overleaf pack imports while copying into the site tree', () => {
    const cloneDir = tempDir();
    const destTopicDir = mkdtempSync(
      join(repoRoot, 'public', 'tex', 'further-maths', 'core-pure', '__deploy-test-'),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const src = join(cloneDir, '(QBT) Test Topic.tex');
      writeFileSync(
        src,
        [
          String.raw`\documentclass[leqno]{article}`,
          String.raw`\input{preamble.tex}`,
          String.raw`\djsQbtHeader{Test Topic}`,
          String.raw`\begin{document}`,
          String.raw`\djsFrontMatter`,
          String.raw`\end{document}`,
          '',
        ].join('\n'),
      );

      const destDir = join(destTopicDir, 'qbt');
      mkdirSync(destDir, { recursive: true });
      const dest = join(destDir, '_QBT__Test_Topic.tex');

      copyNormalizedPackTex(src, dest);

      const copied = readFileSync(dest, 'utf8');
      expect(copied).toContain(PACK_PREAMBLE_SITE_INPUT);
      expect(copied).not.toContain(String.raw`\input{preamble.tex}`);
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/imports preamble\.tex/));
    } finally {
      warn.mockRestore();
      rmSync(cloneDir, { recursive: true, force: true });
      rmSync(destTopicDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// prepareImportedTex: no full-line comment survives import
// ---------------------------------------------------------------------------

describe('prepareImportedTex', () => {
  const REL = 'public/tex/further-maths/core-pure/vectors/qbt/_QBT__Plane_Intersections.tex';
  const source = [
    '% Pack questions',
    String.raw`\documentclass[leqno]{article}`,
    String.raw`\input{preamble.tex}`,
    '   % a note in the preamble',
    '',
    String.raw`\djsQbtHeader{Planes}`,
    String.raw`\djsLastUpdated{1 October 2026}`,
    '',
    String.raw`\begin{document}`,
    String.raw`\djsFrontMatter`,
    String.raw`\begin{enumerate}`,
    '% ========== Question 1 ==========',
    '% id: q1',
    String.raw`\questionitem`,
    '% Solution: x = 2',
    String.raw`Find the line of intersection. % keep this note`,
    '%',
    '% A diagram goes here.',
    '\\end{enumerate}',
    '\\end{document}',
    '',
  ].join('\r\n');
  const identity = {
    title: 'Plane Intersections',
    strand: 'Core Pure',
    section: 'Vectors, Matrices & Linear Transformations',
  };

  it('leaves no full-line comment but the question delimiters and source hints, preamble included', () => {
    const out = prepareImportedTex(source, REL, identity, '5 October 2026');
    const comments = out.split('\n').filter((line) => /^\s*%/.test(line));
    expect(comments).toEqual([
      '% ---- Question 1 ----',
      '% [Source: _QBT__Plane_Intersections, Q1]',
    ]);
    expect(out.split('\n').filter(isUnexpectedFullLineComment)).toEqual([]);
    expect(out).toContain('Find the line of intersection. % keep this note');
  });

  it('puts the pack in the site wrapper with its title, site path and date', () => {
    const out = prepareImportedTex(source, REL, identity, '5 October 2026');
    expect(out).toContain(PACK_PREAMBLE_SITE_INPUT);
    expect(out).toContain(String.raw`\djsLastUpdated{1 October 2026}`);
    expect(out).not.toMatch(/\r/);
    expect(readPackIdentity(out)).toEqual({
      title: 'Plane Intersections',
      sitePath: { strand: 'Core Pure', section: 'Vectors, Matrices & Linear Transformations' },
    });
  });

  it('keeps \\djsMechanicsPack', () => {
    const mech = source.replace('\\djsLastUpdated', '\\djsMechanicsPack\r\n\\djsLastUpdated');
    expect(prepareImportedTex(mech, REL, identity)).toMatch(/^\\djsMechanicsPack$/m);
  });
});

// ---------------------------------------------------------------------------
// Local pack folder sources
// ---------------------------------------------------------------------------

const DOC = '\\begin{document}\n\\end{document}\n';

function packFolder({ manifest, files = {} } = {}) {
  const dir = tempDir();
  if (manifest) writeFileSync(join(dir, PACK_MANIFEST), JSON.stringify(manifest));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

const MANIFEST = {
  format: 1,
  topic: 'Polar Coordinates',
  questions: '(QBT) Polar Coordinates.tex',
  solutions: '(QBT) [Solns] Polar Coordinates.tex',
  preamble: 'preamble.tex',
};

describe('parseSource', () => {
  it('treats an existing folder as a local source, quoted or not', () => {
    const dir = tempDir();
    try {
      expect(parseSource(dir)).toEqual({ kind: 'dir', dir });
      expect(parseSource(`  "${dir}"  `)).toEqual({ kind: 'dir', dir });
      expect(parseSource(`'${dir}'`)).toEqual({ kind: 'dir', dir });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a missing folder or anything else', () => {
    expect(parseSource(join(tmpdir(), 'no-such-folder-xyz', 'pack'))).toBeNull();
    expect(parseSource('')).toBeNull();
  });

  it('does not take a file for a folder', () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, 'a.tex'), DOC);
      expect(parseSource(join(dir, 'a.tex'))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('readPackManifest', () => {
  it('returns null when the folder has no pack.json', () => {
    const dir = packFolder();
    try {
      expect(readPackManifest(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns the topic and the two file names', () => {
    const dir = packFolder({ manifest: MANIFEST });
    try {
      expect(readPackManifest(dir)).toEqual({
        topic: 'Polar Coordinates',
        questions: '(QBT) Polar Coordinates.tex',
        solutions: '(QBT) [Solns] Polar Coordinates.tex',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns the mark scheme file name when pack.json names one', () => {
    const dir = packFolder({ manifest: { ...MANIFEST, markscheme: '(QBT) [MS] Polar Coordinates.yaml' } });
    try {
      expect(readPackManifest(dir)).toMatchObject({ markscheme: '(QBT) [MS] Polar Coordinates.yaml' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    [{ ...MANIFEST, markscheme: '' }, /"markscheme" must be a non-empty string/],
    [{ ...MANIFEST, markscheme: 'ms/scheme.yaml' }, /"markscheme" must be a file name/],
    [{ ...MANIFEST, format: 2 }, /unsupported format/],
    [{ ...MANIFEST, topic: '' }, /"topic"/],
    [{ ...MANIFEST, questions: '../elsewhere.tex' }, /file name/],
    [{ ...MANIFEST, solutions: 3 }, /"solutions"/],
  ])('rejects a bad manifest (%#)', (manifest, message) => {
    const dir = packFolder({ manifest });
    try {
      expect(() => readPackManifest(dir)).toThrow(message);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveTexPairFromDir', () => {
  it('uses the files pack.json names and skips discovery', () => {
    const dir = packFolder({
      manifest: MANIFEST,
      files: {
        '(QBT) Polar Coordinates.tex': DOC,
        '(QBT) [Solns] Polar Coordinates.tex': DOC,
        // Would make discovery ambiguous; pack.json makes it irrelevant.
        '(QBT) Other.tex': DOC,
        'preamble.tex': '% preamble\n',
      },
    });
    try {
      const manifest = readPackManifest(dir);
      expect(resolveTexPairFromDir(dir, 'Typed Differently', manifest)).toEqual({
        qbtPath: join(dir, '(QBT) Polar Coordinates.tex'),
        solnPath: join(dir, '(QBT) [Solns] Polar Coordinates.tex'),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a file pack.json names is missing', () => {
    const dir = packFolder({ manifest: MANIFEST, files: { '(QBT) Polar Coordinates.tex': DOC } });
    try {
      expect(() => resolveTexPairFromDir(dir, 'Polar Coordinates', readPackManifest(dir))).toThrow(
        /\[Solns\] Polar Coordinates\.tex is listed in pack\.json but missing/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to filename discovery without pack.json', () => {
    const dir = packFolder({
      files: {
        '(QBT) Topic.tex': DOC,
        '(QBT) [Solns] Topic.tex': DOC,
        'preamble.tex': '% no document here\n',
      },
    });
    try {
      expect(resolveTexPairFromDir(dir, 'Topic', null)).toEqual({
        qbtPath: join(dir, '(QBT) Topic.tex'),
        solnPath: join(dir, '(QBT) [Solns] Topic.tex'),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a missing kind without pack.json as null, as for a clone', () => {
    const dir = packFolder({ files: { '(QBT) Topic.tex': DOC } });
    try {
      expect(resolveTexPairFromDir(dir, 'Topic', null).solnPath).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('findSchemeFile', () => {
  const NAME = '(QBT) [MS] Polar Coordinates.yaml';

  it('takes the file pack.json names, and refuses one that is missing', () => {
    const dir = packFolder({ files: { 'scheme.yaml': 'format: 1\n' } });
    try {
      expect(findSchemeFile(dir, 'Polar Coordinates', { markscheme: 'scheme.yaml' })).toBe(join(dir, 'scheme.yaml'));
      expect(() => findSchemeFile(dir, 'Polar Coordinates', { markscheme: 'other.yaml' })).toThrow(
        /other\.yaml is listed in pack\.json but missing/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to the file name, with or without pack.json, and is null without one', () => {
    expect(schemeFileName('Polar Coordinates')).toBe(NAME);
    const dir = packFolder({ files: { [NAME]: 'format: 1\n' } });
    try {
      expect(findSchemeFile(dir, 'Polar Coordinates', null)).toBe(join(dir, NAME));
      expect(findSchemeFile(dir, 'Polar Coordinates', { topic: 'Polar Coordinates' })).toBe(join(dir, NAME));
      expect(findSchemeFile(dir, 'Other Title', null)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('promptTopic', () => {
  const rlAnswering = (answer) => ({ question: vi.fn(async () => answer) });

  it('offers the pack.json topic as the default', async () => {
    const rl = rlAnswering('');
    expect(await promptTopic(rl, 'Polar Coordinates')).toBe('Polar Coordinates');
    expect(rl.question.mock.calls[0][0]).toContain('default "Polar Coordinates"');
  });

  it('lets a typed topic override the default', async () => {
    expect(await promptTopic(rlAnswering('  Polar Curves '), 'Polar Coordinates')).toBe(
      'Polar Curves',
    );
  });

  it('keeps the example prompt without a default', async () => {
    const rl = rlAnswering('Vectors');
    expect(await promptTopic(rl, null)).toBe('Vectors');
    expect(rl.question.mock.calls[0][0]).toContain('e.g. "Matrix Determinants & Inverses"');
  });
});

describe('importedPackIdentity', () => {
  const strands = [
    {
      category: 'FM - Core Pure',
      title: 'Core Pure',
      topics: [{ id: 'vectors', topic: 'Vectors', title: 'Vectors, Matrices & Linear Transformations' }],
    },
  ];

  it('titles a Further Maths pack by its topic name and names its site path', () => {
    expect(
      importedPackIdentity('further-maths/core-pure/vectors', 'Plane Intersections', {
        category: 'FM - Core Pure',
        topic: 'Vectors',
      }, strands),
    ).toEqual({
      title: 'Plane Intersections',
      strand: 'Core Pure',
      section: 'Vectors, Matrices & Linear Transformations',
    });
  });

  it('sets only the title when the strand is unknown, and nothing outside Further Maths', () => {
    expect(
      importedPackIdentity('further-maths/other/x', 'T', { category: 'unknown', topic: 'X' }, strands),
    ).toEqual({ title: 'T' });
    expect(importedPackIdentity('tmua', 'T', { category: 'TMUA', topic: 'T' }, strands)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// preparePackPair: the solutions document's statements follow the questions'
// ---------------------------------------------------------------------------

/** A pack whose first statement ends with a figure and then a commented description of it. */
function describedDiagramPack({ title = 'Test Pack', mechanics = false, solnQuestions = 2, extra = '' } = {}) {
  const preamble = (header) => [
    String.raw`\documentclass[leqno]{article}`,
    String.raw`\input{preamble.tex}`,
    `\\${header}{${title}}`,
    ...(mechanics ? [String.raw`\djsMechanicsPack`] : []),
    String.raw`\djsLastUpdated{1 October 2026}`,
    String.raw`\begin{document}`,
    String.raw`\djsFrontMatter`,
    String.raw`\begin{enumerate}`,
    '',
  ];
  const q1 = [
    '% ========== Question 1 ==========',
    '% id: Q01_area',
    String.raw`\questionitem`,
    '',
    String.raw`Find the area of the triangle shown.\marks{4}${extra}`,
    '',
    String.raw`\begin{figure}[H]`,
    String.raw`    \centering`,
    String.raw`    \begin{tikzpicture}\draw (0,0) -- (2,0) -- (0,1) -- cycle;\end{tikzpicture}`,
    String.raw`\end{figure}`,
    '',
    '%%%',
    '% DIAGRAM DESCRIPTION (for checking)',
    '%',
    '% A right-angled triangle.',
    '%%%',
  ];
  const q2 = [
    '% ========== Question 2 ==========',
    '% id: Q02_root',
    String.raw`\questionitem`,
    '',
    String.raw`Show that \(x = 2\) is a root of \(x^2 - 4 = 0\).\marks{2}`,
  ];
  const box = (text) => ['', String.raw`\vspace*{10pt}`, '', String.raw`\begin{djsSolution}`, text, String.raw`\end{djsSolution}`];
  const end = ['', String.raw`\end{enumerate}`, String.raw`\end{document}`, ''];
  const qbt = [...preamble('djsQbtHeader'), ...q1, '', String.raw`\newpage`, '', ...q2, ...end].join('\n');
  const soln = [
    ...preamble('djsSolnHeader'),
    ...q1,
    ...box('The area is \\(1\\).'),
    ...(solnQuestions > 1 ? ['', String.raw`\newpage`, '', ...q2, ...box('Substitute.')] : []),
    ...end,
  ].join('\n');
  return { qbt, soln };
}

describe('preparePackPair', () => {
  const where = {
    qbtRel: 'public/tex/further-maths/core-pure/polar-coordinates/qbt/_QBT__Test_Pack.tex',
    solnRel: 'public/tex/further-maths/core-pure/polar-coordinates/soln/_QBT___Solns__Test_Pack.tex',
    identity: { title: 'Test Pack', strand: 'Core Pure', section: 'Polar Coordinates' },
    initialDate: '5 October 2026',
  };

  it('leaves a pair in sync when a statement ends in a commented diagram description', () => {
    const raw = describedDiagramPack();
    const qbt = prepareImportedTex(raw.qbt, where.qbtRel, where.identity, where.initialDate);
    const soln = prepareImportedTex(raw.soln, where.solnRel, where.identity, where.initialDate);
    expect(syncPair(qbt, soln).changed).toBe(true);

    const pair = preparePackPair(raw, where);
    expect(pair.qbt).toBe(qbt);
    expect(pair.synced).toEqual([1]);
    expect(syncPair(pair.qbt, pair.soln)).toMatchObject({ changed: false, fatal: false });
    expect(pair.soln).toContain('The area is \\(1\\).');
  });

  it("refuses documents whose questions don't line up", () => {
    expect(() => preparePackPair(describedDiagramPack({ solnQuestions: 1 }), where)).toThrow(
      /don't hold the same questions/,
    );
  });
});

// ---------------------------------------------------------------------------
// prepareScheme: the mark scheme, checked against the placed documents
// ---------------------------------------------------------------------------

const TEST_WHERE = {
  qbtRel: 'public/tex/further-maths/core-pure/polar-coordinates/qbt/_QBT__Test_Pack.tex',
  solnRel: 'public/tex/further-maths/core-pure/polar-coordinates/soln/_QBT___Solns__Test_Pack.tex',
  identity: { title: 'Test Pack', strand: 'Core Pure', section: 'Polar Coordinates' },
};

/**
 * A scheme for `describedDiagramPack`, stamped against its documents as the
 * import places them; `edit` changes the data before it is written.
 */
function schemeFor(raw = describedDiagramPack(), edit = (scheme) => scheme) {
  const prepared = preparePackPair(raw, TEST_WHERE);
  const pack = packModel(prepared.qbt, prepared.soln);
  const scheme = {
    format: 1,
    pack: 'Test Pack',
    last_updated: '1 October 2026',
    questions: [
      {
        q: 1,
        stamp: pack.questions[0].stamp,
        parts: [
          {
            part: '',
            rows: [
              {
                scheme: String.raw`\(\frac12 \times 2 \times 1\)` + '\n',
                marks: [{ code: 'M1', note: 'Uses half the base times the height.' }, { code: 'A1' }],
              },
              { scheme: String.raw`\(1\)` + '\n', marks: [{ code: 'A1' }, { code: 'B1' }] },
            ],
          },
        ],
      },
      {
        q: 2,
        stamp: pack.questions[1].stamp,
        parts: [
          {
            part: '',
            rows: [
              {
                scheme: String.raw`\(2^2 - 4 = 0\)` + '\n',
                marks: [{ code: 'M1', note: String.raw`Substitutes \(x = 2\).` }, { code: 'A1 AG' }],
              },
            ],
          },
        ],
      },
    ],
  };
  return emitScheme(edit(scheme));
}

/** The scheme with question `i`'s first mark changed by `edit`. */
const editFirstMark = (i, edit) => (scheme) => {
  const mark = scheme.questions[i].parts[0].rows[0].marks[0];
  scheme.questions[i].parts[0].rows[0].marks[0] = edit(mark);
  return scheme;
};

describe('prepareScheme', () => {
  const prepared = () => preparePackPair(describedDiagramPack(), TEST_WHERE);

  it('passes a scheme stamped against the placed documents, and renders it', () => {
    const yaml = schemeFor();
    const out = prepareScheme(yaml, prepared());
    expect(out.yaml).toBe(yaml);
    expect(out.tex).toContain(String.raw`\input{../../../../_shared/markscheme_preamble.tex}`);
    expect(out.tex).toContain(String.raw`\djsSchemeHeader{Test Pack}`);
  });

  it.each([
    ['a pack field that disagrees with the title', (s) => ({ ...s, pack: 'Other Pack' }), /its pack is "Other Pack", but the pack's title is "Test Pack"/],
    ['a flag', (s) => {
      s.questions[1].parts[0] = { part: '', flag: { kind: 'not_drafted', why: 'Not yet drafted.' } };
      return s;
    }, /\[rule 24\] a committed scheme holds no flag/],
    ['a query', editFirstMark(0, (m) => ({ ...m, query: { code: 'B1', why: 'May be a B mark.' } })), /\[rule 24\] a committed scheme holds no query/],
    ['a stale stamp', (s) => {
      s.questions[0].stamp = '00000000';
      return s;
    }, /Q1's stamp 00000000 does not match its statement and solution/],
    ['an error of the other rules', editFirstMark(1, (m) => ({ code: m.code })), /\[rule 15\]/],
  ])('refuses %s', (_name, edit, message) => {
    expect(() => prepareScheme(schemeFor(undefined, edit), prepared())).toThrow(message);
  });

  it('refuses a missing stamp', () => {
    const yaml = schemeFor().replace(/(  - q: 2\n)    stamp: [0-9a-f]+\n/, '$1');
    expect(yaml).not.toBe(schemeFor());
    expect(() => prepareScheme(yaml, prepared())).toThrow(/Q2 has no stamp/);
  });

  it('refuses YAML that does not parse', () => {
    expect(() => prepareScheme('format: [1\n', prepared())).toThrow(/does not parse/);
  });
});

// ---------------------------------------------------------------------------
// runImport: a whole import against a scratch checkout
// ---------------------------------------------------------------------------

/** Every file under `root`, by its path relative to `root`, with its text. */
function treeState(root) {
  const out = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else out[relative(root, path).replace(/\\/g, '/')] = readFileSync(path, 'utf8');
    }
  };
  walk(root);
  return out;
}

const SITE_DIRS = ['core-pure/polar-coordinates/qbt/build', 'core-pure/no-packs-yet', 'further-mechanics/centre-of-mass'];

/** A scratch checkout: the real catalogue and sections, and empty section folders. */
function scratchSite() {
  const root = mkdtempSync(join(tmpdir(), 'import-run-'));
  mkdirSync(join(root, 'src', 'data'), { recursive: true });
  for (const name of ['resources.ts', 'topics.ts']) {
    writeFileSync(join(root, 'src', 'data', name), readFileSync(join(repoRoot, 'src', 'data', name)));
  }
  for (const name of GENERATED_FILES) writeFileSync(join(root, 'src', 'data', name), `// ${name} before\n`);
  for (const dir of SITE_DIRS) mkdirSync(join(root, 'public', 'tex', 'further-maths', dir), { recursive: true });
  // Another pack's build output, which nothing may touch.
  writeFileSync(join(root, 'public', 'tex', 'further-maths', SITE_DIRS[0], '_QBT__Other.pdf'), 'other');
  return root;
}

function packDir(raw = describedDiagramPack(), { scheme = null, schemeByName = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'import-pack-'));
  const manifest = { format: 1, topic: 'Test Pack', questions: 'Questions.tex', solutions: 'Solutions.tex' };
  if (scheme !== null) {
    const name = schemeByName ? '(QBT) [MS] Test Pack.yaml' : 'Scheme.yaml';
    if (!schemeByName) manifest.markscheme = name;
    writeFileSync(join(dir, name), scheme);
  }
  writeFileSync(join(dir, PACK_MANIFEST), JSON.stringify(manifest));
  writeFileSync(join(dir, 'Questions.tex'), raw.qbt);
  writeFileSync(join(dir, 'Solutions.tex'), raw.soln);
  writeFileSync(join(dir, 'preamble.tex'), '% the bundled preamble\n');
  return dir;
}

/** Stand-ins for the compile and the generators, counting their calls. */
function standIns({ failCompile = false, failRegenerate = null, onCompile } = {}) {
  // `failCompile` is true, or a test of the `.tex` path for the one that fails.
  const calls = { compile: 0, regenerate: 0 };
  return {
    calls,
    compile(tex) {
      calls.compile++;
      onCompile?.(tex);
      const build = join(dirname(tex), 'build');
      const stem = basename(tex, '.tex');
      mkdirSync(join(build, 'aux'), { recursive: true });
      writeFileSync(join(build, 'aux', `${stem}.log`), 'log');
      if (typeof failCompile === 'function' ? failCompile(tex) : failCompile) {
        return { ok: false, log: `${stem}.tex:3: Undefined control sequence.` };
      }
      writeFileSync(join(build, `${stem}.pdf`), `pdf of ${stem}`);
      return { ok: true, pdf: join(build, `${stem}.pdf`) };
    },
    regenerate(root) {
      calls.regenerate++;
      for (const name of GENERATED_FILES) writeFileSync(join(root, 'src', 'data', name), `// ${name} regenerated\n`);
      failRegenerate?.(root);
    },
  };
}

describe('runImport', () => {
  const ID = 'fm-polar-test-pack';
  const args = (folder, overrides = {}, { leaveOut = false } = {}) => {
    const flags = {
      folder,
      'site-path': 'core-pure/polar-coordinates',
      title: 'Test Pack',
      boards: 'all',
      id: ID,
      ...overrides,
    };
    return [
      ...Object.entries(flags).flatMap(([k, v]) => [`--${k}`, v]),
      ...(leaveOut ? ['--no-markscheme'] : []),
      '--yes',
    ];
  };
  const placed = (root, kind) =>
    join(
      root,
      'public/tex/further-maths/core-pure/polar-coordinates',
      kind,
      kind === 'qbt' ? '_QBT__Test_Pack.tex' : '_QBT___Solns__Test_Pack.tex',
    );

  let root;
  let folder;
  let journalDir;
  let journalPath;
  let errors;
  beforeEach(() => {
    root = scratchSite();
    folder = packDir();
    journalDir = mkdtempSync(join(tmpdir(), 'import-journal-'));
    journalPath = join(journalDir, 'journal.json');
    errors = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of [root, folder, journalDir]) rmSync(dir, { recursive: true, force: true });
  });

  it('places a pack whose statement ends in a diagram description, with the pair in sync', async () => {
    const stand = standIns();
    await runImport(args(folder), { root, journalPath, ...stand });

    const qbt = readFileSync(placed(root, 'qbt'), 'utf8');
    const soln = readFileSync(placed(root, 'soln'), 'utf8');
    expect(syncPair(qbt, soln)).toMatchObject({ changed: false, fatal: false });
    expect(bodyCommentViolations(qbt)).toEqual([]);
    expect(bodyCommentViolations(soln)).toEqual([]);
    expect(existsSync(placed(root, 'qbt').replace(/\.tex$/, '.pdf'))).toBe(true);
    expect(existsSync(placed(root, 'soln').replace(/\.tex$/, '.pdf'))).toBe(true);

    const ids = parseResourcesEntries(readFileSync(join(root, 'src/data/resources.ts'), 'utf8')).map((e) => e.id);
    expect(ids.indexOf(`${ID}-solns`)).toBe(ids.indexOf(ID) + 1);
    expect(ids.indexOf(ID)).toBe(ids.indexOf('fm-polar-tangents-polar-curves-ms') + 1);
    expect(stand.calls).toEqual({ compile: 2, regenerate: 1 });
    expect(existsSync(journalPath)).toBe(false);
  });

  describe('refuses before writing anything', () => {
    const cases = [
      ['an id already taken', { id: 'fm-polar-tangents-polar-curves' }, /already in resources\.ts/],
      ['a site path in the wrong case', { 'site-path': 'core-pure/Polar-Coordinates' }, /but there is core-pure\/polar-coordinates/],
      ['a section folder that does not exist', { 'site-path': 'core-pure/nowhere' }, /made by hand/],
      ['a Further Mechanics pack without \\djsMechanicsPack', { 'site-path': 'further-mechanics/centre-of-mass' }, /Further Mechanics pack calls/],
    ];
    for (const [name, overrides, message] of cases) {
      it(name, async () => {
        const stand = standIns();
        const before = treeState(root);
        await expect(runImport(args(folder, overrides), { root, journalPath, ...stand })).rejects.toThrow(message);
        expect(treeState(root)).toEqual(before);
        expect(stand.calls).toEqual({ compile: 0, regenerate: 0 });
        expect(existsSync(journalPath)).toBe(false);
      });
    }

    it('a document with \\includegraphics, or documents whose questions differ', async () => {
      const before = treeState(root);
      for (const [raw, message] of [
        [describedDiagramPack({ extra: String.raw` \includegraphics{photo}` }), /TikZ-only/],
        [describedDiagramPack({ solnQuestions: 1 }), /don't hold the same questions/],
      ]) {
        const other = packDir(raw);
        try {
          await expect(runImport(args(other), { root, journalPath, ...standIns() })).rejects.toThrow(message);
        } finally {
          rmSync(other, { recursive: true, force: true });
        }
      }
      expect(treeState(root)).toEqual(before);
    });

    it('a pack already on the site', async () => {
      mkdirSync(dirname(placed(root, 'soln')), { recursive: true });
      writeFileSync(placed(root, 'soln'), 'already here');
      const before = treeState(root);
      await expect(runImport(args(folder), { root, journalPath, ...standIns() })).rejects.toThrow(/already exists/);
      expect(treeState(root)).toEqual(before);
    });
  });

  it('puts everything back when a compile fails, keeping other packs\' build output', async () => {
    const before = treeState(root);
    await expect(runImport(args(folder), { root, journalPath, ...standIns({ failCompile: true }) })).rejects.toThrow(
      /nothing was imported/,
    );
    expect(treeState(root)).toEqual(before);
    expect(errors.find((e) => e.startsWith('\nimport-pack:'))).toMatch(/did not compile/);
    expect(existsSync(journalPath)).toBe(false);
  });

  it('restores resources.ts and the generated files when a generator fails, reporting its error first', async () => {
    const before = treeState(root);
    const stand = standIns({
      failRegenerate: () => {
        throw new Error('the counts could not be read');
      },
    });
    await expect(runImport(args(folder), { root, journalPath, ...stand })).rejects.toThrow(/nothing was imported/);
    expect(treeState(root)).toEqual(before);
    expect(errors.findIndex((e) => e.includes('the counts could not be read'))).toBe(0);
  });

  it('puts everything back when stopped by a signal', async () => {
    const signals = new EventEmitter();
    const stand = standIns({ onCompile: () => signals.emit('SIGINT') });
    const before = treeState(root);
    await expect(runImport(args(folder), { root, journalPath, signals, ...stand })).rejects.toThrow(
      /nothing was imported/,
    );
    expect(errors[0]).toMatch(/stopped by SIGINT/);
    expect(stand.calls.compile).toBe(1);
    expect(treeState(root)).toEqual(before);
    expect(signals.listenerCount('SIGINT')).toBe(0);
  });

  it('keeps the original error when part of the rollback fails, and leaves no temporary file', async () => {
    const resources = join(root, 'src/data/resources.ts');
    const stand = standIns({
      failRegenerate: () => {
        // Something holds resources.ts so it can't be put back.
        rmSync(resources);
        mkdirSync(resources);
        throw new Error('the counts could not be read');
      },
    });
    await expect(runImport(args(folder), { root, journalPath, ...stand })).rejects.toThrow(/still as the import left it/);
    expect(errors[0]).toMatch(/the counts could not be read/);
    expect(errors.some((e) => /could not put back src\/data\/resources\.ts/.test(e))).toBe(true);
    expect(readdirSync(join(root, 'src/data')).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect(existsSync(placed(root, 'qbt'))).toBe(false);
    expect(existsSync(journalPath)).toBe(true);
  });

  describe('with its mark scheme', () => {
    const SECTION = 'public/tex/further-maths/core-pure/polar-coordinates';
    const msPath = (ext) => join(root, SECTION, 'ms', `_QBT___MS__Test_Pack.${ext}`);
    const rows = () => parseResourcesEntries(readFileSync(join(root, 'src/data/resources.ts'), 'utf8'));

    it('places the scheme beside the pack, rendered and compiled, with its row after the solutions row', async () => {
      const yaml = schemeFor();
      const withScheme = packDir(undefined, { scheme: yaml });
      try {
        const stand = standIns();
        await runImport(args(withScheme), { root, journalPath, ...stand });
        expect(readFileSync(msPath('yaml'), 'utf8')).toBe(yaml);
        const tex = readFileSync(msPath('tex'), 'utf8');
        const placedPack = { qbt: readFileSync(placed(root, 'qbt'), 'utf8'), soln: readFileSync(placed(root, 'soln'), 'utf8') };
        expect(tex).toBe(prepareScheme(yaml, placedPack).tex);
        expect(readFileSync(msPath('pdf'), 'utf8')).toBe('pdf of _QBT___MS__Test_Pack');
        expect(stand.calls).toEqual({ compile: 3, regenerate: 1 });

        const entries = rows();
        const ids = entries.map((e) => e.id);
        expect(ids.slice(ids.indexOf(ID), ids.indexOf(ID) + 3)).toEqual([ID, `${ID}-solns`, `${ID}-ms`]);
        const ms = entries.find((e) => e.id === `${ID}-ms`);
        expect(ms).toMatchObject({
          title: 'Test Pack',
          description: 'Mark scheme',
          file: `/tex/further-maths/core-pure/polar-coordinates/ms/_QBT___MS__Test_Pack.pdf`,
          category: 'FM - Core Pure',
          type: 'markscheme',
          paperId: ID,
          topic: 'Polar Coordinates',
        });
        expect(ms.pairId).toBeUndefined();
        expect(ms.boards).toBeUndefined();
        expect(existsSync(journalPath)).toBe(false);
      } finally {
        rmSync(withScheme, { recursive: true, force: true });
      }
    });

    it('finds the scheme by its file name when pack.json names none', async () => {
      const byName = packDir(undefined, { scheme: schemeFor(), schemeByName: true });
      try {
        await runImport(args(byName), { root, journalPath, ...standIns() });
        expect(existsSync(msPath('yaml'))).toBe(true);
        expect(rows().some((e) => e.id === `${ID}-ms`)).toBe(true);
      } finally {
        rmSync(byName, { recursive: true, force: true });
      }
    });

    it('with --no-markscheme, imports the two documents and says the scheme was left out', async () => {
      const withScheme = packDir(undefined, { scheme: schemeFor() });
      try {
        const stand = standIns();
        await runImport(args(withScheme, {}, { leaveOut: true }), { root, journalPath, ...stand });
        expect(existsSync(join(root, SECTION, 'ms'))).toBe(false);
        expect(rows().some((e) => e.id === `${ID}-ms`)).toBe(false);
        expect(rows().some((e) => e.id === `${ID}-solns`)).toBe(true);
        expect(stand.calls).toEqual({ compile: 2, regenerate: 1 });
        expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/left out \(--no-markscheme\): Scheme\.yaml is not imported/));
        expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^The mark scheme was left out \(--no-markscheme\)/));
      } finally {
        rmSync(withScheme, { recursive: true, force: true });
      }
    });

    it('imports the two documents alone from a folder with no scheme', async () => {
      const stand = standIns();
      await runImport(args(folder), { root, journalPath, ...stand });
      expect(existsSync(join(root, SECTION, 'ms'))).toBe(false);
      expect(rows().some((e) => e.id === `${ID}-ms`)).toBe(false);
      expect(stand.calls).toEqual({ compile: 2, regenerate: 1 });
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/scheme: +none in /));
    });

    describe('refuses before writing anything', () => {
      const cases = [
        ['a scheme pack.json names but the folder lacks', () => {
          const dir = packDir(undefined, { scheme: schemeFor() });
          rmSync(join(dir, 'Scheme.yaml'));
          return dir;
        }, /Scheme\.yaml is listed in pack\.json but missing/],
        ['a --title that disagrees with the scheme', () => packDir(undefined, { scheme: schemeFor() }), /its pack is "Test Pack", but the pack's title is "Other Pack"/, undefined, { title: 'Other Pack' }],
        ['a pack field that disagrees with the title', () => packDir(undefined, { scheme: schemeFor(undefined, (s) => ({ ...s, pack: 'Other Pack' })) }), /its pack is "Other Pack"/],
        ['a flag', () => packDir(undefined, {
          scheme: schemeFor(undefined, (s) => {
            s.questions[1].parts[0] = { part: '', flag: { kind: 'not_drafted', why: 'Not yet drafted.' } };
            return s;
          }),
        }), /holds no flag/],
        ['a query', () => packDir(undefined, {
          scheme: schemeFor(undefined, editFirstMark(0, (m) => ({ ...m, query: { code: 'B1', why: 'May be a B mark.' } }))),
        }), /holds no query/],
        ['a stale stamp', () => packDir(undefined, {
          scheme: schemeFor(undefined, (s) => {
            s.questions[0].stamp = '00000000';
            return s;
          }),
        }), /Q1's stamp 00000000 does not match/],
        ['a missing stamp', () => packDir(undefined, {
          scheme: schemeFor().replace(/(  - q: 2\n)    stamp: [0-9a-f]+\n/, '$1'),
        }), /Q2 has no stamp/],
        ['a mark scheme id already taken', () => packDir(undefined, { scheme: schemeFor() }), /the id 'fm-polar-test-pack-ms' is already in resources\.ts/, () => {
          const resources = join(root, 'src/data/resources.ts');
          const text = readFileSync(resources, 'utf8');
          writeFileSync(resources, text.replace("id: 'fm-polar-tangents-polar-curves-ms'", `id: '${ID}-ms'`));
        }],
        ['a scheme already on the site', () => packDir(undefined, { scheme: schemeFor() }), /ms\/_QBT___MS__Test_Pack\.yaml already exists/, () => {
          mkdirSync(join(root, SECTION, 'ms'), { recursive: true });
          writeFileSync(msPath('yaml'), 'already here');
        }],
      ];
      for (const [name, makeFolder, message, arrange, overrides] of cases) {
        it(name, async () => {
          arrange?.();
          const dir = makeFolder();
          try {
            const stand = standIns();
            const before = treeState(root);
            await expect(runImport(args(dir, overrides), { root, journalPath, ...stand })).rejects.toThrow(message);
            expect(treeState(root)).toEqual(before);
            expect(stand.calls).toEqual({ compile: 0, regenerate: 0 });
            expect(existsSync(journalPath)).toBe(false);
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        });
      }
    });

    it("puts everything back, the scheme's files, folder and build output included, when its compile fails", async () => {
      const withScheme = packDir(undefined, { scheme: schemeFor() });
      try {
        const before = treeState(root);
        const stand = standIns({ failCompile: (tex) => basename(tex).startsWith('_QBT___MS__') });
        await expect(runImport(args(withScheme), { root, journalPath, ...stand })).rejects.toThrow(
          /nothing was imported/,
        );
        expect(stand.calls.compile).toBe(3);
        expect(treeState(root)).toEqual(before);
        expect(existsSync(join(root, SECTION, 'ms'))).toBe(false);
        expect(errors.find((e) => e.startsWith('\nimport-pack:'))).toMatch(/_QBT___MS__Test_Pack\.tex did not compile/);
        expect(existsSync(journalPath)).toBe(false);
      } finally {
        rmSync(withScheme, { recursive: true, force: true });
      }
    });

    it('is put back from the journal of a run killed part-way, scheme and row included', async () => {
      const withScheme = packDir(undefined, { scheme: schemeFor() });
      try {
        // The journal as it stood when the generators started, as a run
        // killed then would leave it.
        let journal;
        const first = standIns();
        await runImport(args(withScheme), {
          root,
          journalPath,
          ...first,
          regenerate: (at) => {
            journal = readFileSync(journalPath, 'utf8');
            first.regenerate(at);
          },
        });
        const after = treeState(root);
        const recorded = JSON.parse(journal);
        expect(recorded.files).toEqual(
          expect.arrayContaining(['yaml', 'tex', 'pdf'].map((ext) => `${SECTION}/ms/_QBT___MS__Test_Pack.${ext}`)),
        );
        expect(recorded.dirs).toContain(`${SECTION}/ms`);
        expect(recorded.builds).toContain(`${SECTION}/ms/_QBT___MS__Test_Pack.tex`);
        writeFileSync(journalPath, journal);

        const stand = standIns();
        await runImport(args(withScheme), { root, journalPath, ...stand });
        expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/An earlier import stopped part-way/));
        expect(stand.calls).toEqual({ compile: 3, regenerate: 2 });
        expect(treeState(root)).toEqual(after);
        expect(existsSync(journalPath)).toBe(false);
      } finally {
        rmSync(withScheme, { recursive: true, force: true });
      }
    });
  });

  describe('a run killed part-way', () => {
    /** The journal a run killed after starting the generators would have left. */
    function killedRun(before) {
      const rel = (path) => relative(root, path).replace(/\\/g, '/');
      const now = readFileSync(join(root, 'src/data/resources.ts'), 'utf8');
      writeFileSync(
        journalPath,
        JSON.stringify({
          files: [placed(root, 'qbt'), placed(root, 'soln')].flatMap((tex) => [tex, tex.replace(/\.tex$/, '.pdf')]).map(rel),
          dirs: [rel(dirname(placed(root, 'soln')))],
          builds: [rel(placed(root, 'qbt')), rel(placed(root, 'soln'))],
          resources: {
            path: 'src/data/resources.ts',
            before: before['src/data/resources.ts'],
            wrote: createHash('sha256').update(now).digest('hex'),
          },
          regenerating: true,
        }),
      );
    }

    it('is put back by the next run, which then imports', async () => {
      const before = treeState(root);
      await runImport(args(folder), { root, journalPath, ...standIns() });
      const after = treeState(root);
      killedRun(before);

      const stand = standIns();
      await runImport(args(folder), { root, journalPath, ...stand });
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/An earlier import stopped part-way/));
      expect(stand.calls).toEqual({ compile: 2, regenerate: 2 });
      expect(treeState(root)).toEqual(after);
      expect(existsSync(journalPath)).toBe(false);
    });

    it("leaves resources.ts alone if it changed since, and keeps the journal", async () => {
      const before = treeState(root);
      await runImport(args(folder), { root, journalPath, ...standIns() });
      killedRun(before);
      const resources = join(root, 'src/data/resources.ts');
      writeFileSync(resources, `${readFileSync(resources, 'utf8')}// edited since\n`);

      await expect(runImport(args(folder), { root, journalPath, ...standIns() })).rejects.toThrow(
        /changed since the import wrote it/,
      );
      expect(readFileSync(resources, 'utf8')).toMatch(/edited since/);
      expect(existsSync(placed(root, 'qbt'))).toBe(false);
      expect(existsSync(journalPath)).toBe(true);
    });
  });
});
