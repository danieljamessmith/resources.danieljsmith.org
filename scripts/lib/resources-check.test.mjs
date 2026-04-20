import { describe, it, expect } from 'vitest';
import { checkResources } from './resources-check.mjs';

/**
 * @param {Partial<import('./resources-derive.mjs').ResourceEntry>} e
 * @returns {import('./resources-derive.mjs').ResourceEntry}
 */
function entry(e) {
  return {
    id: 'fm-x',
    file: '/tex/x.pdf',
    category: 'FM - Core Pure',
    ...e,
  };
}

/**
 * @param {Parameters<typeof checkResources>[0]} input
 */
function run(input) {
  return checkResources({
    diskFiles: new Set(),
    deployedPdfs: new Set(),
    questionCountKeys: new Set(),
    ...input,
  });
}

describe('checkResources: per-entry checks', () => {
  it('flags duplicate ids', () => {
    const { violations } = run({
      entries: [
        entry({ id: 'a', file: '/tex/a.pdf' }),
        entry({ id: 'a', file: '/tex/b.pdf' }),
      ],
      diskFiles: new Set(['/tex/a.pdf', '/tex/b.pdf']),
    });
    expect(violations.some((v) => v.kind === 'duplicate-id' && v.id === 'a')).toBe(true);
  });

  it('flags missing files', () => {
    const { violations } = run({
      entries: [entry({ id: 'a', file: '/tex/missing.pdf' })],
    });
    expect(
      violations.some((v) => v.kind === 'missing-file' && v.file === '/tex/missing.pdf'),
    ).toBe(true);
  });

  it('passes when entry file exists on disk', () => {
    const { violations } = run({
      entries: [entry({ id: 'a', file: '/tex/a.pdf' })],
      diskFiles: new Set(['/tex/a.pdf']),
    });
    expect(violations).toEqual([]);
  });

  it('flags type:questions /qbt/ entry that is missing from questionCounts', () => {
    const { violations } = run({
      entries: [
        entry({
          id: 'q',
          file: '/tex/further-maths/core-pure/topic/qbt/_QBT__Topic.pdf',
          type: 'questions',
        }),
      ],
      diskFiles: new Set(['/tex/further-maths/core-pure/topic/qbt/_QBT__Topic.pdf']),
    });
    expect(violations.some((v) => v.kind === 'missing-question-count')).toBe(true);
  });

  it('does not flag missing-question-count for non-questions entries', () => {
    const { violations } = run({
      entries: [
        entry({
          id: 'n',
          file: '/tex/further-maths/core-pure/topic/notes/_Notes__T.pdf',
          type: 'notes',
        }),
      ],
      diskFiles: new Set(['/tex/further-maths/core-pure/topic/notes/_Notes__T.pdf']),
    });
    expect(violations.some((v) => v.kind === 'missing-question-count')).toBe(false);
  });
});

describe('checkResources: pair link integrity', () => {
  /** Convenience: a clean Q/S pair that lives on disk. */
  function pair() {
    return {
      entries: [
        entry({
          id: 'q',
          file: '/tex/.../qbt/_QBT__Foo.pdf',
          type: 'questions',
          pairId: 's',
          topic: 'Foo',
        }),
        entry({
          id: 's',
          file: '/tex/.../soln/_QBT___Solns__Foo.pdf',
          type: 'solutions',
          pairId: 'q',
          topic: 'Foo',
        }),
      ],
      diskFiles: new Set(['/tex/.../qbt/_QBT__Foo.pdf', '/tex/.../soln/_QBT___Solns__Foo.pdf']),
      questionCountKeys: new Set(['/tex/.../qbt/_QBT__Foo.pdf']),
    };
  }

  it('passes for a clean Q/S pair', () => {
    const { violations } = run(pair());
    expect(violations).toEqual([]);
  });

  it('flags pair-id-unresolved when pairId points at no entry', () => {
    const p = pair();
    p.entries[0].pairId = 'nope';
    const { violations } = run(p);
    expect(violations.some((v) => v.kind === 'pair-id-unresolved' && v.id === 'q')).toBe(true);
  });

  it('does NOT report pair-asymmetry against the side whose pairId is unresolved (that side already has pair-id-unresolved)', () => {
    const p = pair();
    p.entries[0].pairId = 'nope';
    const { violations } = run(p);
    // 'q'.pairId is unresolved → only `pair-id-unresolved` against q, no
    // asymmetry against q (since the partner doesn't exist to compare).
    const qViolations = violations.filter((v) => v.id === 'q');
    expect(qViolations.map((v) => v.kind)).toEqual(['pair-id-unresolved']);
    // 's'.pairId resolves to entry q, but q.pairId='nope'≠'s' → s has an
    // asymmetry, which usefully tells the user to fix q's pairId.
    expect(violations.some((v) => v.kind === 'pair-asymmetry' && v.id === 's')).toBe(true);
  });

  it('flags pair-asymmetry when both exist but only one side links back', () => {
    const p = pair();
    p.entries[1].pairId = undefined;
    const { violations } = run(p);
    expect(violations.some((v) => v.kind === 'pair-asymmetry' && v.id === 'q')).toBe(true);
    expect(violations.some((v) => v.kind === 'pair-id-unresolved')).toBe(false);
  });

  it('flags pair-asymmetry when partner.pairId points at a third entry', () => {
    const p = pair();
    p.entries.push(
      entry({
        id: 'other',
        file: '/tex/.../qbt/_QBT__Other.pdf',
        type: 'questions',
        topic: 'Other',
      }),
    );
    p.diskFiles.add('/tex/.../qbt/_QBT__Other.pdf');
    p.questionCountKeys.add('/tex/.../qbt/_QBT__Other.pdf');
    p.entries[1].pairId = 'other';
    const { violations } = run(p);
    expect(violations.some((v) => v.kind === 'pair-asymmetry' && v.id === 'q')).toBe(true);
  });

  it('flags pair-type-mismatch when both sides are the same type', () => {
    const p = pair();
    p.entries[1].type = 'questions';
    const { violations } = run(p);
    expect(violations.some((v) => v.kind === 'pair-type-mismatch')).toBe(true);
  });

  it('flags pair-topic-mismatch when topics disagree', () => {
    const p = pair();
    p.entries[1].topic = 'Bar';
    const { violations } = run(p);
    expect(violations.some((v) => v.kind === 'pair-topic-mismatch')).toBe(true);
  });

  it('flags pair-topic-mismatch when categories disagree', () => {
    const p = pair();
    p.entries[1].category = 'FM - Further Mechanics';
    const { violations } = run(p);
    expect(violations.some((v) => v.kind === 'pair-topic-mismatch')).toBe(true);
  });

  it('skips type/topic checks when the link is asymmetric (no false positives)', () => {
    const p = pair();
    p.entries[1].pairId = undefined;
    p.entries[1].type = 'questions';
    p.entries[1].topic = 'Bar';
    const { violations } = run(p);
    // Only the asymmetry violation; type/topic mismatches are suppressed.
    expect(violations.some((v) => v.kind === 'pair-asymmetry')).toBe(true);
    expect(violations.some((v) => v.kind === 'pair-type-mismatch')).toBe(false);
    expect(violations.some((v) => v.kind === 'pair-topic-mismatch')).toBe(false);
  });
});

describe('checkResources: orphan PDFs', () => {
  it('emits a warning (not violation) for unreferenced PDFs', () => {
    const { violations, warnings } = run({
      entries: [entry({ id: 'a', file: '/tex/referenced.pdf' })],
      diskFiles: new Set(['/tex/referenced.pdf']),
      deployedPdfs: new Set(['/tex/referenced.pdf', '/tex/orphaned.pdf']),
    });
    expect(violations).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('orphan-pdf');
    expect(warnings[0].file).toBe('/tex/orphaned.pdf');
  });

  it('emits no warning when every PDF on disk is referenced', () => {
    const { warnings } = run({
      entries: [entry({ id: 'a', file: '/tex/a.pdf' })],
      diskFiles: new Set(['/tex/a.pdf']),
      deployedPdfs: new Set(['/tex/a.pdf']),
    });
    expect(warnings).toEqual([]);
  });
});
