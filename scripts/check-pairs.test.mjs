import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEC = 'public/tex/further-maths/core-pure/fixture';
const QBT = `${SEC}/qbt/_QBT__Fixture.tex`;
const YAML = `${SEC}/ms/_QBT___MS__Fixture.yaml`;
const TEX = `${SEC}/ms/_QBT___MS__Fixture.tex`;
const PDF = `${SEC}/ms/_QBT___MS__Fixture.pdf`;
const env = { ...process.env };
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX']) delete env[name];

let root;
const git = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' });
function put(path, text = 'stand-in') {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
const check = (over = {}) => spawnSync(process.execPath, [join(root, 'scripts/check-pairs.mjs')], {
  cwd: root, env: { ...env, ...over }, encoding: 'utf8',
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'check-pairs-'));
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  for (const path of ['check-pairs.mjs', 'lib/pair-presence.mjs', 'lib/tex-utils.mjs']) {
    const target = join(root, 'scripts', path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(HERE, path), target);
  }
  for (const path of [QBT, `${SEC}/qbt/_QBT__Fixture.pdf`, `${SEC}/soln/_QBT___Solns__Fixture.tex`,
    `${SEC}/soln/_QBT___Solns__Fixture.pdf`, YAML, TEX, PDF]) put(path);
  git('add', 'public');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('check-pairs discovery', () => {
  it('passes a complete pack and indexed scheme', () => {
    expect(check()).toMatchObject({ status: 0 });
  });

  it('ignores an unstaged deletion of a scheme file', () => {
    unlinkSync(join(root, TEX));
    expect(check()).toMatchObject({ status: 0 });
  });

  it('ignores an untracked draft with no PDF, including nested pack-shaped files', () => {
    put(`${SEC}/ms/_QBT___MS__Draft.yaml`);
    put(`${SEC}/ms/_QBT___MS__Draft.tex`);
    put(`${SEC}/ms/draft/qbt/_QBT__Draft.tex`);
    expect(check()).toMatchObject({ status: 0 });
  });

  it.each([QBT, `${SEC}/soln/_QBT___Solns__Fixture.pdf`])('still blocks a missing tracked pack file: %s', (path) => {
    unlinkSync(join(root, path));
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[tracked-but-missing]');
    expect(result.stderr).toContain('[incomplete-quartet]');
  });

  it('still blocks an untracked incomplete QBT/solution quartet', () => {
    put(`${SEC}/qbt/_QBT__Other.tex`);
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[incomplete-quartet]');
  });

  it('checks scheme presence in the index supplied by the hook', () => {
    const index = join(root, '.git', 'index-commit');
    copyFileSync(join(root, '.git', 'index'), index);
    execFileSync('git', ['rm', '--cached', PDF], { cwd: root, env: { ...env, GIT_INDEX_FILE: index } });
    expect(check().status).toBe(0);
    const result = check({ GIT_INDEX_FILE: index });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[incomplete-scheme]');
  });
});
