import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
} from './import-pack.mjs';
import { PACK_PREAMBLE_SITE_INPUT, readPackIdentity } from './lib/pack-preamble.mjs';
import { isUnexpectedFullLineComment } from './check-tex.mjs';

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

  it.each([
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
