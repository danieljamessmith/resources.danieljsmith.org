import { describe, it, expect } from 'vitest';
import { parseMarkCheckedArgs } from './mark-checked.mjs';

const context = { today: '2026-10-13', env: {} };
const parse = (argv, env = {}) => parseMarkCheckedArgs(argv, { ...context, env });

describe('parseMarkCheckedArgs', () => {
  it('reads an id with a date, defaulting to today', () => {
    expect(parse(['fm-x-solns', '--date', '2026-10-02'])).toEqual({
      ok: true,
      id: 'fm-x-solns',
      date: '2026-10-02',
      reordered: false,
    });
    expect(parse(['--date=2026-10-02', 'fm-x-solns'])).toMatchObject({ ok: true, date: '2026-10-02' });
    expect(parse(['fm-x-solns'])).toMatchObject({ ok: true, date: '2026-10-13' });
    expect(parse(['fm-x-solns', '--reordered'])).toMatchObject({ ok: true, reordered: true });
  });

  it('refuses a misspelt flag or a stray argument instead of recording today', () => {
    expect(parse(['fm-x-solns', '--dates', '2026-10-03'])).toMatchObject({ ok: false, message: expect.stringMatching(/--dates/) });
    expect(parse(['fm-x-solns', '2026-10-03'])).toEqual({
      ok: false,
      message: 'give one solutions id, not fm-x-solns 2026-10-03',
    });
    expect(parse([])).toEqual({ ok: false, message: 'give a solutions id' });
  });

  it("explains the date npm took for itself when run without --", () => {
    expect(parse(['fm-x-solns', '2026-10-03'], { npm_config_date: 'true' })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/npm took --date for itself/),
    });
  });

  it('refuses a malformed date, a date after today, and --date with --reordered', () => {
    expect(parse(['fm-x-solns', '--date', '2026-13-01'])).toMatchObject({ ok: false, message: expect.stringMatching(/YYYY-MM-DD/) });
    expect(parse(['fm-x-solns', '--date', '2099-01-01'])).toEqual({
      ok: false,
      message: '2099-01-01 is after today (2026-10-13)',
    });
    expect(parse(['fm-x-solns', '--date', '2026-10-13'])).toMatchObject({ ok: true });
    expect(parse(['fm-x-solns', '--reordered', '--date', '2026-10-02'])).toMatchObject({ ok: false });
  });
});
