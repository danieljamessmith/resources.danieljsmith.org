import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { collectCompileFiles, resolveSearchRoot } from './compile-tex.mjs';

describe('resolveSearchRoot', () => {
  it('uses the whole Further Maths tree for the further-maths scope', () => {
    expect(normalize(resolveSearchRoot('further-maths', 'TEXROOT'))).toBe(
      normalize('TEXROOT/further-maths'),
    );
  });

  it('keeps all as the tex root', () => {
    expect(resolveSearchRoot('all', 'TEXROOT')).toBe('TEXROOT');
  });
});

describe('collectCompileFiles', () => {
  it('collects both Core Pure and Further Mechanics packs but skips _shared', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'compile-tex-'));
    try {
      const texRoot = join(repoRoot, 'public', 'tex');
      const files = [
        'further-maths/core-pure/topic/qbt/_QBT__A.tex',
        'further-maths/further-mechanics/topic/soln/_QBT___Solns__B.tex',
        '_shared/pack_preamble.tex',
      ];
      for (const rel of files) {
        const abs = join(texRoot, rel);
        mkdirSync(join(abs, '..'), { recursive: true });
        writeFileSync(abs, '');
      }

      const found = collectCompileFiles(join(texRoot, 'further-maths'), repoRoot)
        .map((p) => p.slice(repoRoot.length + 1).replace(/\\/g, '/'))
        .sort();

      expect(found).toEqual([
        'public/tex/further-maths/core-pure/topic/qbt/_QBT__A.tex',
        'public/tex/further-maths/further-mechanics/topic/soln/_QBT___Solns__B.tex',
      ]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
