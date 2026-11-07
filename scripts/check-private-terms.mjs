/**
 * Read-only check that no private term appears in tracked files as they are
 * staged, in new, unignored files, or in a commit message. Text files are
 * read as they are; PDFs by the text their pages show and the strings they
 * carry (`lib/pdf-text.mjs`). Other binary files are skipped.
 *
 * The term list is deliberately kept out of the repo. It is read from, in
 * order:
 *   1. the PRIVATE_TERMS environment variable (newline- or comma-separated)
 *   2. the file named by PRIVATE_TERMS_FILE
 *   3. ~/.config/private-terms.txt
 * With no list, or an empty one, the check fails: a check that passes
 * without one guards nothing. Hits are reported by term number only.
 *
 * Usage:
 *   node scripts/check-private-terms.mjs                 # scan the tree
 *   node scripts/check-private-terms.mjs --message FILE  # scan a commit message
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { parseTermList, findTermHits, textOf } from './lib/private-terms.mjs';
import { pdfText } from './lib/pdf-text.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

/**
 * The term list, or why there is none.
 * @returns {{ terms: string[] } | { problem: string }}
 */
function loadTerms() {
  const sources = 'set PRIVATE_TERMS or PRIVATE_TERMS_FILE, or put the list in ~/.config/private-terms.txt';
  if (process.env.PRIVATE_TERMS?.trim()) {
    const terms = parseTermList(process.env.PRIVATE_TERMS);
    return terms.length > 0 ? { terms } : { problem: 'PRIVATE_TERMS holds no terms' };
  }
  const file = process.env.PRIVATE_TERMS_FILE || join(homedir(), '.config', 'private-terms.txt');
  if (!existsSync(file)) return { problem: `no term list found: ${sources}` };
  const terms = parseTermList(readFileSync(file, 'utf8'));
  return terms.length > 0 ? { terms } : { problem: `the term list holds no terms: ${sources}` };
}

/**
 * Every tracked or new, unignored file under `cwd` as it would be committed:
 * repo-relative path and bytes. A tracked file is read as it is staged in the
 * index (so an unstaged edit can neither hide nor add a hit), a new file from
 * disk. Git's own environment, `GIT_INDEX_FILE` included, is respected.
 *
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ path: string, buf: Buffer }[]}
 */
export function candidateFiles(cwd, env = process.env) {
  const maxBuffer = 1024 * 1024 * 1024;
  const git = (args, input) => execFileSync('git', args, { cwd, env, input, maxBuffer });

  /** @type {Map<string, string>} path -> blob id, one entry per path */
  const staged = new Map();
  for (const entry of git(['ls-files', '-s', '-z']).toString('utf8').split('\0')) {
    const m = /^(\d+) ([0-9a-f]+) \d+\t(.+)$/s.exec(entry);
    // Submodules (mode 160000) have no blob here.
    if (m && m[1] !== '160000' && !staged.has(m[3])) staged.set(m[3], m[2]);
  }

  /** @type {{ path: string, buf: Buffer }[]} */
  const files = [];
  if (staged.size > 0) {
    const paths = [...staged.keys()];
    const out = git(['cat-file', '--batch'], paths.map((p) => `${staged.get(p)}\n`).join(''));
    let at = 0;
    for (const path of paths) {
      const headerEnd = out.indexOf(0x0a, at);
      const [, type, sizeText] = out.toString('latin1', at, headerEnd).split(' ');
      if (type !== 'blob') throw new Error(`check-private-terms: cannot read the staged ${path}`);
      const size = Number(sizeText);
      files.push({ path, buf: out.subarray(headerEnd + 1, headerEnd + 1 + size) });
      at = headerEnd + 1 + size + 1;
    }
  }

  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).toString('utf8');
  for (const rel of untracked.split('\0').filter(Boolean)) {
    const abs = join(cwd, rel);
    if (existsSync(abs)) files.push({ path: rel, buf: readFileSync(abs) });
  }
  return files;
}

function main() {
  const loaded = loadTerms();
  if (!('terms' in loaded)) {
    console.error(`check-private-terms: ${loaded.problem}`);
    process.exit(1);
  }
  const { terms } = loaded;

  const msgIdx = process.argv.indexOf('--message');
  /** @type {{ label: string, text: string, lines: boolean }[]} */
  const targets = [];

  if (msgIdx !== -1) {
    const msgFile = process.argv[msgIdx + 1];
    targets.push({ label: 'commit message', text: readFileSync(msgFile, 'utf8'), lines: true });
  } else {
    for (const { path: rel, buf } of candidateFiles(repoRoot)) {
      if (rel.toLowerCase().endsWith('.pdf')) {
        targets.push({ label: rel, text: pdfText(buf), lines: false });
      } else {
        const text = textOf(buf);
        if (text !== null) targets.push({ label: rel, text, lines: true });
      }
    }
  }

  let count = 0;
  for (const { label, text, lines } of targets) {
    const hits = findTermHits(text, terms);
    // A PDF's text has no source lines to point at: report each term once.
    const shown = lines ? hits : hits.filter((h, i) => hits.findIndex((o) => o.termNo === h.termNo) === i);
    for (const hit of shown) {
      console.error(`✗ ${lines ? `${label}:${hit.line}` : label} contains private term #${hit.termNo}`);
      count++;
    }
  }

  if (count > 0) {
    console.error(`\ncheck-private-terms: ${count} hit(s)`);
    process.exit(1);
  }

  console.log(`check-private-terms: ${targets.length} source(s) clean`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
