/**
 * Read-only guard for the mark schemes, run by the pre-commit after
 * `check-generated`. It reads the git index, not the working tree: the
 * schemes and the pack files as they are about to be committed, so an
 * unstaged draft or revision never blocks another commit.
 *
 * On every scheme in the index it runs the checker's rules 1-24 (a
 * committed scheme holds no flag or query), and rules 25-27
 * (`scripts/lib/markscheme-guard.mjs`): the `.tex` is what `render` writes
 * now; every `ms/` YAML has its `.tex` and PDF, and every `ms/` file belongs
 * to a pack in its section; every question's stamp matches its statement
 * and solution now.
 *
 * Stale stamps (rule 27) block only when `STALE_STAMPS` is `'block'`. It is
 * `'report'` while the schemes are backfilled, so a stale stamp is listed and
 * the commit goes through; once every pack's scheme is committed it becomes
 * `'block'`. The summary line names the setting.
 *
 * Usage:
 *   node scripts/check-markschemes.mjs [--warnings]
 *
 * Exit 0, 1 on errors (or stale stamps under `'block'`), 2 on a usage error.
 */

import { execFileSync } from 'node:child_process';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardScheme, indexSchemes } from './lib/markscheme-guard.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** `'report'` lists stale stamps and lets the commit through; `'block'` fails on them. */
export const STALE_STAMPS = 'report';

const SHARED_DIR = 'public/tex/_shared';

/**
 * Git at `root`. A hook's environment is kept on purpose: `git commit -a` or
 * `git commit <paths>` points `GIT_INDEX_FILE` at the index being committed.
 */
function git(root, args, { input, env = process.env } = {}) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: root,
    env,
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
}

/**
 * The index's entries under `public/tex/further-maths`: path to blob id.
 * Unmerged paths are listed apart.
 *
 * @param {string} root
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readIndex(root, env) {
  const out = git(root, ['ls-files', '-s', '-z', '--', 'public/tex/further-maths'], { env }).toString('utf8');
  const blobs = new Map();
  const unmerged = new Set();
  for (const entry of out.split('\0')) {
    if (!entry) continue;
    const m = /^\d+ ([0-9a-f]+) (\d)\t(.*)$/s.exec(entry);
    if (!m) continue;
    if (m[2] === '0') blobs.set(m[3], m[1]);
    else unmerged.add(m[3]);
  }
  return { blobs, unmerged: [...unmerged].sort() };
}

/**
 * Reads blobs from the object store in one `git cat-file --batch`.
 *
 * @param {string} root
 * @param {string[]} ids
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Map<string, string>} id to its text
 */
export function readBlobs(root, ids, env) {
  const unique = [...new Set(ids)];
  const texts = new Map();
  if (!unique.length) return texts;
  const buf = git(root, ['cat-file', '--batch'], { input: `${unique.join('\n')}\n`, env });
  let pos = 0;
  while (pos < buf.length) {
    const eol = buf.indexOf(0x0a, pos);
    const [id, type, size] = buf.subarray(pos, eol).toString('utf8').split(' ');
    if (type === 'missing') throw new Error(`git cat-file: ${id} is missing`);
    const start = eol + 1;
    const end = start + Number(size);
    texts.set(id, buf.subarray(start, end).toString('utf8'));
    pos = end + 1;
  }
  return texts;
}

/**
 * Runs the guard on the index of the repository at `root`.
 *
 * @param {string} root
 * @param {{ staleStamps?: 'report' | 'block', today?: Date, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{ schemes: number, errors: (import('./lib/markscheme-guard.mjs').Problem & { file: string })[],
 *   warnings: (import('./lib/markscheme-guard.mjs').Problem & { file: string })[],
 *   stale: (import('./lib/markscheme-guard.mjs').Problem & { file: string })[], ok: boolean, summary: string }}
 */
export function guardIndex(root, { staleStamps = STALE_STAMPS, today, env } = {}) {
  const { blobs, unmerged } = readIndex(root, env);
  const errors = unmerged.map((file) => ({ file, rule: 26, where: 'file', q: null, message: 'unmerged: resolve the conflict first' }));
  const { problems, schemes } = indexSchemes([...blobs.keys()]);
  errors.push(...problems);

  const wanted = schemes.flatMap((s) => [s.yaml, s.tex, s.qbt, s.soln]).filter(Boolean);
  const texts = readBlobs(root, wanted.map((p) => blobs.get(p)), env);
  const text = (path) => texts.get(blobs.get(path));

  const warnings = [];
  const stale = [];
  for (const s of schemes) {
    if (!s.qbt || !s.soln) continue; // rule 26 has named the missing pack
    const shared = posix.relative(posix.dirname(s.yaml), SHARED_DIR);
    const result = guardScheme(
      { yaml: text(s.yaml), tex: s.tex ? text(s.tex) : null, qbt: text(s.qbt), soln: text(s.soln) },
      { shared, today },
    );
    errors.push(...result.errors.map((p) => ({ file: s.yaml, ...p })));
    warnings.push(...result.warnings.map((p) => ({ file: s.yaml, ...p })));
    stale.push(...result.stale.map((p) => ({ file: s.yaml, ...p })));
  }

  const blocking = errors.length + (staleStamps === 'block' ? stale.length : 0);
  const summary =
    `check-markschemes: ${schemes.length} scheme(s) in the index, ${errors.length} error(s), ` +
    `${warnings.length} warning(s) | stale stamps: ${staleStamps}, ${stale.length} stale`;
  return { schemes: schemes.length, errors, warnings, stale, ok: blocking === 0, summary };
}

function formatProblem(p) {
  const where = p.where === 'file' ? '' : ` ${p.where}:`;
  return `${p.file}:${where} [rule ${p.rule}] ${p.message}`;
}

export function main(argv = process.argv.slice(2)) {
  const unknown = argv.filter((a) => a !== '--warnings');
  if (unknown.length) {
    console.error(`check-markschemes: unknown argument ${unknown[0]} (usage: check-markschemes [--warnings])`);
    return 2;
  }
  let result;
  try {
    result = guardIndex(repoRoot);
  } catch (e) {
    console.error(`check-markschemes: ${e.message}`);
    return 1;
  }
  for (const p of result.errors) console.error(`✗ ${formatProblem(p)}`);
  for (const p of result.stale) console.error(`${STALE_STAMPS === 'block' ? '✗' : '  (stale)'} ${formatProblem(p)}`);
  if (argv.includes('--warnings')) for (const p of result.warnings) console.error(`  (warn) ${formatProblem(p)}`);
  const shown = result.warnings.length && !argv.includes('--warnings') ? ' (warnings shown with --warnings)' : '';
  if (!result.ok) {
    console.error(`\n${result.summary}${shown}`);
    return 1;
  }
  console.log(`${result.summary}${shown}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
