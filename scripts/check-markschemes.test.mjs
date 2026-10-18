import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { guardIndex, STALE_STAMPS } from './check-markschemes.mjs';
import { checkScheme, emitScheme, packModel, parseYaml } from './lib/markscheme.mjs';
import { renderScheme } from './lib/markscheme-render.mjs';

// Each test builds a scratch repository holding the mark scheme fixture as
// a pack with its committed scheme, and runs the guard on its index. The
// git environment a hook sets (this suite runs in the pre-commit) is left
// out, or the scratch repository's git would act on this one.
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'lib', 'fixtures', 'markscheme');
const SEC = 'public/tex/further-maths/core-pure/fixture';
const QBT = `${SEC}/qbt/_QBT__Fixture.tex`;
const SOLN = `${SEC}/soln/_QBT___Solns__Fixture.tex`;
const YAML = `${SEC}/ms/_QBT___MS__Fixture.yaml`;
const TEX = `${SEC}/ms/_QBT___MS__Fixture.tex`;
const PDF = `${SEC}/ms/_QBT___MS__Fixture.pdf`;

const env = { ...process.env };
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX']) delete env[name];

let root;
const git = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' });
const read = (path) => readFileSync(join(root, path), 'utf8');
function put(path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
const guard = (opts = {}) => guardIndex(root, { env, ...opts });
const rules = (problems) => [...new Set(problems.map((p) => p.rule))].sort((a, b) => a - b);

/** The scheme's .tex as `render` writes it from `yaml` and the pack now. */
function rendered(yaml = read(YAML), opts = {}) {
  const pack = packModel(read(QBT), read(SOLN));
  return renderScheme(checkScheme(yaml, pack, { draft: opts.draft }).scheme, pack, opts);
}

/** The committed YAML with `change` applied, written canonically. */
function editedYaml(change) {
  const data = parseYaml(read(YAML)).value;
  change(data);
  return emitScheme(data);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'check-markschemes-'));
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  for (const [from, to] of [
    ['qbt/_QBT__Fixture.tex', QBT],
    ['soln/_QBT___Solns__Fixture.tex', SOLN],
    ['ms/_QBT___MS__Fixture.yaml', YAML],
  ]) {
    mkdirSync(dirname(join(root, to)), { recursive: true });
    copyFileSync(join(FIXTURE, from), join(root, to));
  }
  put(`${SEC}/qbt/_QBT__Fixture.pdf`, '%PDF stand-in');
  put(`${SEC}/soln/_QBT___Solns__Fixture.pdf`, '%PDF stand-in');
  put(TEX, rendered());
  put(PDF, '%PDF stand-in');
  git('add', '-A');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('check-markschemes', () => {
  it('passes a committed scheme in step with its pack', () => {
    const result = guard();
    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ ok: true, schemes: 1 });
    expect(result.summary).toBe(
      `check-markschemes: 1 scheme(s) in the index, 0 error(s), ${result.warnings.length} warning(s) | stale stamps: report, 0 stale`,
    );
  });

  it('reports stale stamps until the backfill is done', () => {
    expect(STALE_STAMPS).toBe('report');
  });

  it('blocks a hand-edited .tex (rule 25)', () => {
    put(TEX, read(TEX).replace('Total for Question 1', 'Total for question 1'));
    git('add', TEX);
    const result = guard();
    expect(result.ok).toBe(false);
    expect(rules(result.errors)).toEqual([25]);
    expect(result.errors[0].file).toBe(YAML);
  });

  it('blocks a committed draft .tex (rule 25)', () => {
    const draft = editedYaml((d) => {
      d.questions[0].parts[1].rows[0].marks[0].query = { code: 'B1', why: 'The integral is set up from a formula.' };
    });
    put(TEX, rendered(draft, { draft: true }));
    git('add', TEX);
    expect(rules(guard().errors)).toEqual([25]);
  });

  it('blocks a wrong total: a changed \\marks without its part revised (rule 8)', () => {
    put(QBT, read(QBT).replace('above $O$. \\marks{4}', 'above $O$. \\marks{5}'));
    git('add', QBT);
    const result = guard();
    expect(result.ok).toBe(false);
    expect(rules(result.errors)).toEqual([8]);
    expect(result.errors[0].where).toBe('Q2(a)');
  });

  it('blocks a committed query (rule 24)', () => {
    const queried = editedYaml((d) => {
      d.questions[1].parts[0].rows[0].marks[0].query = { code: 'M1', why: "It applies Hooke's formula." };
    });
    put(YAML, queried);
    git('add', YAML);
    const result = guard();
    expect(result.ok).toBe(false);
    expect(rules(result.errors)).toEqual([24]);
  });

  it('lets an unstaged draft through: a revision, and a new scheme with no PDF', () => {
    const draft = editedYaml((d) => {
      d.questions[1].parts[0].rows[0].marks[0].query = { code: 'M1', why: "It applies Hooke's formula." };
    });
    put(YAML, draft);
    put(TEX, rendered(draft, { draft: true }));
    const other = SEC.replace('/fixture', '/second');
    for (const [from, to] of [
      [QBT, `${other}/qbt/_QBT__Fixture.tex`],
      [SOLN, `${other}/soln/_QBT___Solns__Fixture.tex`],
    ]) {
      put(to, read(from));
    }
    put(`${other}/ms/_QBT___MS__Fixture.yaml`, draft);
    put(`${other}/ms/_QBT___MS__Fixture.tex`, read(TEX));
    const result = guard();
    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ ok: true, schemes: 1 });
  });

  it('blocks a staged scheme without its PDF (rule 26)', () => {
    git('rm', '-q', '--cached', PDF);
    const result = guard();
    expect(result.ok).toBe(false);
    expect(rules(result.errors)).toEqual([26]);
  });

  it('reports a stale stamp and lets the commit through', () => {
    put(SOLN, read(SOLN).replace('The natural length of the string is $2a$.', 'The string has natural length $2a$.'));
    git('add', SOLN);
    const result = guard();
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.stale).toEqual([expect.objectContaining({ file: YAML, rule: 27, q: 2 })]);
    expect(result.summary).toMatch(/\| stale stamps: report, 1 stale$/);
  });

  it("blocks a stale stamp once the setting is 'block'", () => {
    put(SOLN, read(SOLN).replace('The natural length of the string is $2a$.', 'The string has natural length $2a$.'));
    git('add', SOLN);
    const result = guard({ staleStamps: 'block' });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/\| stale stamps: block, 1 stale$/);
  });

  it('reads the index a hook is given (`git commit -a`, `git commit <paths>`)', () => {
    const index = join(root, '.git', 'index-commit');
    copyFileSync(join(root, '.git', 'index'), index);
    put(TEX, read(TEX).replace('Total for Question 1', 'Total for question 1'));
    execFileSync('git', ['add', TEX], { cwd: root, env: { ...env, GIT_INDEX_FILE: index } });
    expect(guard().ok).toBe(true);
    expect(rules(guard({ env: { ...env, GIT_INDEX_FILE: index } }).errors)).toEqual([25]);
  });
});

describe('the pre-commit', () => {
  it('runs check-markschemes after check-generated', () => {
    const hook = readFileSync(join(HERE, '..', '.husky', 'pre-commit'), 'utf8').split(/\r?\n/);
    const generated = hook.indexOf('node scripts/check-generated.mjs');
    expect(generated).toBeGreaterThanOrEqual(0);
    expect(hook.indexOf('node scripts/check-markschemes.mjs')).toBe(generated + 1);
  });
});
