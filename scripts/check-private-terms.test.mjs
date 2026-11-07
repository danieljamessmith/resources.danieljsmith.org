import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { candidateFiles } from './check-private-terms.mjs';
import { findTermHits } from './lib/private-terms.mjs';

/** The environment without git's own variables, so a hook's index is never touched. */
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, stdio: 'ignore' });

describe('candidateFiles (temp repo)', () => {
  /** @type {string} */
  let repo;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'private-terms-'));
    git(repo, 'init', '-q');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  const hitsIn = (path) => {
    const file = candidateFiles(repo, env).find((f) => f.path === path);
    return file ? findTermHits(file.buf.toString('utf8'), ['secretword']) : null;
  };

  it('reads a tracked file as it is staged, not as it is on disk', () => {
    writeFileSync(join(repo, 'a.txt'), 'line one\nsecretword\n');
    git(repo, 'add', 'a.txt');
    writeFileSync(join(repo, 'a.txt'), 'line one\nclean\n');
    expect(hitsIn('a.txt')).toEqual([{ line: 2, termNo: 1 }]);
  });

  it('reads a new, unignored file from disk and leaves ignored files out', () => {
    writeFileSync(join(repo, '.gitignore'), 'ignored.txt\n');
    writeFileSync(join(repo, 'new.txt'), 'secretword\n');
    writeFileSync(join(repo, 'ignored.txt'), 'secretword\n');
    expect(hitsIn('new.txt')).toEqual([{ line: 1, termNo: 1 }]);
    expect(hitsIn('ignored.txt')).toBeNull();
  });
});
