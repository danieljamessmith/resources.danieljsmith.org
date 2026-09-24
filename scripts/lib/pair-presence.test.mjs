import { describe, it, expect } from 'vitest';
import { checkPairPresence } from './pair-presence.mjs';

/**
 * @returns {import('./pair-presence.mjs').PackTopicSlot}
 */
function slot(overrides = {}) {
  return {
    topicKey: 'public/tex/t::Topic',
    relTopicDir: 'public/tex/t',
    topicName: 'Topic',
    qbtTex: true,
    qbtPdf: true,
    solnTex: true,
    solnPdf: true,
    ...overrides,
  };
}

describe('checkPairPresence', () => {
  it('passes when all quartets complete and nothing tracked-missing', () => {
    const { violations } = checkPairPresence([slot()], []);
    expect(violations).toEqual([]);
  });

  it('flags incomplete quartet when one member missing', () => {
    const { violations } = checkPairPresence(
      [
        slot({
          qbtTex: true,
          qbtPdf: true,
          solnTex: true,
          solnPdf: false,
        }),
      ],
      [],
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('incomplete-quartet');
    expect(violations[0].message).toContain('soln .pdf');
  });

  it('does not flag a topic with zero members (never created)', () => {
    const { violations } = checkPairPresence([], []);
    expect(violations).toEqual([]);
  });

  it('does not flag when topic fully absent from slots array', () => {
    const { violations } = checkPairPresence(
      [
        slot({
          topicKey: 'a::A',
          relTopicDir: 'public/tex/a',
          topicName: 'A',
          qbtTex: false,
          qbtPdf: false,
          solnTex: false,
          solnPdf: false,
        }),
      ],
      [],
    );
    expect(violations).toEqual([]);
  });

  it('flags multiple missing parts in one message', () => {
    const { violations } = checkPairPresence(
      [
        slot({
          qbtTex: true,
          qbtPdf: false,
          solnTex: false,
          solnPdf: false,
        }),
      ],
      [],
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toMatch(/qbt \.pdf/);
    expect(violations[0].message).toMatch(/soln \.tex/);
    expect(violations[0].message).toMatch(/soln \.pdf/);
  });

  it('flags tracked-but-missing paths', () => {
    const { violations } = checkPairPresence([], ['public/tex/x/qbt/_QBT__Y.tex']);
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('tracked-but-missing');
    expect(violations[0].file).toBe('public/tex/x/qbt/_QBT__Y.tex');
  });

  it('normalizes backslashes in tracked-missing paths', () => {
    const { violations } = checkPairPresence([], ['public\\tex\\x\\qbt\\_QBT__Y.tex']);
    expect(violations[0].file).toBe('public/tex/x/qbt/_QBT__Y.tex');
  });

  it('combines quartet and tracked-missing findings', () => {
    const { violations } = checkPairPresence(
      [
        slot({
          qbtTex: true,
          qbtPdf: false,
          solnTex: true,
          solnPdf: true,
        }),
      ],
      ['public/tex/a.tex'],
    );
    expect(violations).toHaveLength(2);
    const kinds = violations.map((v) => v.kind).sort();
    expect(kinds).toEqual(['incomplete-quartet', 'tracked-but-missing']);
  });
});
