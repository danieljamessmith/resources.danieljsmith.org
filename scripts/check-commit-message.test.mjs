import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { attributionLine } from './check-commit-message.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-commit-message.mjs');

describe('attributionLine', () => {
  it.each([
    'Co-Authored-By: Someone <someone@example.com>',
    'co-authored-by: someone',
    'CO-AUTHORED-BY: SOMEONE',
  ])('refuses a co-author line in any case: %s', (line) => {
    expect(attributionLine(`Fix the board pills\n\nBody text.\n\n${line}\n`)).toEqual({ line: 5 });
  });

  it.each(['Generated with something', 'made by hand, generated with care', 'GENERATED WITH X', 'generated  with x'])(
    'refuses a line holding the phrase "generated with" in any case: %s',
    (line) => {
      expect(attributionLine(`Fix the board pills\n${line}`)).toEqual({ line: 2 });
    },
  );

  it('names the first attribution line when there are several', () => {
    const message = 'Subject\n\nBody\n\nGenerated with x\nCo-Authored-By: y\n';
    expect(attributionLine(message)).toEqual({ line: 5 });
  });

  it('counts lines the same with CRLF endings', () => {
    expect(attributionLine('Subject\r\n\r\nCo-Authored-By: y\r\n')).toEqual({ line: 3 });
  });

  it.each([
    'Update the Projectile Motion questions, worked solutions and mark scheme',
    'Replace the generated PDF with the corrected one',
    'Regenerated with the new preamble',
    'Credit the co-authors in the notes',
    'Docs: what was generated, with dates',
  ])('accepts an ordinary message: %s', (subject) => {
    expect(attributionLine(`${subject}\n\nA body line.\n`)).toBeNull();
  });

  it('ignores what git cuts off below the scissors line', () => {
    const message = [
      'Subject',
      '',
      '# ------------------------ >8 ------------------------',
      '# Do not modify or remove the line above.',
      '+Co-Authored-By: in a diff shown by commit --verbose',
      '+Generated with x',
    ].join('\n');
    expect(attributionLine(message)).toBeNull();
  });
});

describe('check-commit-message (the hook)', () => {
  /** @type {string} */
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'commit-message-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (message) => {
    const file = join(dir, 'COMMIT_EDITMSG');
    writeFileSync(file, message);
    return spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
  };

  it('fails with one line on stderr naming the attribution line', () => {
    const result = run('Subject\n\nBody\nCo-Authored-By: y\n');
    expect(result.status).toBe(1);
    const lines = result.stderr.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/\bline 4\b/);
  });

  it('passes a plain message', () => {
    const result = run('Subject\n\nThe generated PDF is replaced.\n');
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });
});
