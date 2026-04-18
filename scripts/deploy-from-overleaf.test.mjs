import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseProjectId,
  parseBoardSelection,
  sanitizeTopic,
  findPackTex,
  tryFindPackTex,
  resolveTexPairFromClone,
  formatPairPreview,
} from './deploy-from-overleaf.mjs';

// ---------------------------------------------------------------------------
// parseProjectId
// ---------------------------------------------------------------------------

describe('parseProjectId', () => {
  it('accepts a bare hex ID', () => {
    expect(parseProjectId('abc123def456')).toBe('abc123def456');
  });

  it('extracts the ID from a full Overleaf URL', () => {
    expect(parseProjectId('https://www.overleaf.com/project/abc123def456')).toBe('abc123def456');
  });

  it('trims whitespace before parsing', () => {
    expect(parseProjectId('  abc123def456  ')).toBe('abc123def456');
  });

  it('returns null for an invalid input', () => {
    expect(parseProjectId('not-a-valid-id')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseProjectId('')).toBeNull();
  });

  it('is case-insensitive for hex characters', () => {
    expect(parseProjectId('ABC123DEF456')).toBe('ABC123DEF456');
  });
});

// ---------------------------------------------------------------------------
// parseBoardSelection
// ---------------------------------------------------------------------------

describe('parseBoardSelection', () => {
  it('returns null boardIds for empty input (all boards)', () => {
    expect(parseBoardSelection('')).toEqual({ ok: true, boardIds: null });
    expect(parseBoardSelection('   ')).toEqual({ ok: true, boardIds: null });
  });

  it('returns null boardIds when option 1 is selected alone', () => {
    expect(parseBoardSelection('1')).toEqual({ ok: true, boardIds: null });
  });

  it('returns the correct board ID for a single selection', () => {
    expect(parseBoardSelection('2')).toEqual({ ok: true, boardIds: ['edexcel'] });
    expect(parseBoardSelection('3')).toEqual({ ok: true, boardIds: ['aqa'] });
    expect(parseBoardSelection('4')).toEqual({ ok: true, boardIds: ['ocr-a'] });
    expect(parseBoardSelection('5')).toEqual({ ok: true, boardIds: ['ocr-mei'] });
    expect(parseBoardSelection('6')).toEqual({ ok: true, boardIds: ['cie'] });
  });

  it('returns multiple board IDs for a comma-separated selection', () => {
    const result = parseBoardSelection('2,3');
    expect(result).toEqual({ ok: true, boardIds: ['edexcel', 'aqa'] });
  });

  it('deduplicates repeated selections', () => {
    const result = parseBoardSelection('2,2,3');
    expect(result).toEqual({ ok: true, boardIds: ['edexcel', 'aqa'] });
  });

  it('accepts space-separated input', () => {
    const result = parseBoardSelection('2 4');
    expect(result).toEqual({ ok: true, boardIds: ['edexcel', 'ocr-a'] });
  });

  it('returns an error when option 1 is combined with others', () => {
    const result = parseBoardSelection('1,2');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/cannot be combined/i);
  });

  it('returns an error for an out-of-range number', () => {
    const result = parseBoardSelection('7');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/between 1 and 6/i);
  });

  it('returns an error for non-numeric input', () => {
    const result = parseBoardSelection('abc');
    expect(result.ok).toBe(false);
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
// formatPairPreview
// ---------------------------------------------------------------------------

describe('formatPairPreview', () => {
  it('includes ids and sibling hint', () => {
    const out = formatPairPreview({
      id: 'fm-vectors-test',
      topicName: "De Moivre's Theorem",
      siblingId: 'fm-vectors-prev-solns',
    });
    expect(out).toContain("fm-vectors-test");
    expect(out).toContain('fm-vectors-prev-solns');
  });
});

// ---------------------------------------------------------------------------
// Legacy second-URL prompt (orchestration smoke)
// ---------------------------------------------------------------------------

describe('legacy second clone prompt', () => {
  it('requests a second URL when only one kind exists in the first clone', async () => {
    const questions = [
      'https://overleaf.com/project/aaaaaaaaaaaaaaaaaaaaaaaa',
      '', // second URL — user aborts
    ];
    let i = 0;
    const rl = {
      question: vi.fn(async () => questions[i++] ?? ''),
      close: vi.fn(),
    };

    const dir = tempDir();
    try {
      writeFileSync(
        join(dir, '(QBT) Topic.tex'),
        '\\begin{document}\n\\end{document}\n',
      );
      const r = resolveTexPairFromClone(dir, 'Topic');
      expect(r.qbtPath).not.toBeNull();
      expect(r.solnPath).toBeNull();

      const line = await rl.question(
        '\nOnly found questions in the first project (or one .tex could not be classified). Paste second Overleaf URL or ID (Enter to abort): ',
      );
      expect(line).toContain('aaaaaaaa');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
