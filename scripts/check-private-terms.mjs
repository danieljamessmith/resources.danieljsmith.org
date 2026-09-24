/**
 * Read-only check that no private term appears in tracked (or new, unignored)
 * text files, or in a commit message.
 *
 * The term list is deliberately kept out of the repo. It is read from, in
 * order:
 *   1. the PRIVATE_TERMS environment variable (newline- or comma-separated;
 *      CI supplies it from a repository secret)
 *   2. the file named by PRIVATE_TERMS_FILE
 *   3. ~/.config/private-terms.txt
 * With no list available the check is skipped (exit 0), so clones without the
 * list still work. Hits are reported by term number only.
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

import { parseTermList, findTermHits, looksBinary } from './lib/private-terms.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

/** @returns {string[] | null} */
function loadTerms() {
  if (process.env.PRIVATE_TERMS) return parseTermList(process.env.PRIVATE_TERMS);
  const file = process.env.PRIVATE_TERMS_FILE || join(homedir(), '.config', 'private-terms.txt');
  if (existsSync(file)) return parseTermList(readFileSync(file, 'utf8'));
  return null;
}

/** @returns {string[]} repo-relative paths */
function listCandidateFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split('\0').filter(Boolean);
}

function main() {
  const terms = loadTerms();
  if (!terms || terms.length === 0) {
    console.log('check-private-terms: no term list found; skipped');
    return;
  }

  const msgIdx = process.argv.indexOf('--message');
  /** @type {{ label: string, text: string }[]} */
  const targets = [];

  if (msgIdx !== -1) {
    const msgFile = process.argv[msgIdx + 1];
    targets.push({ label: 'commit message', text: readFileSync(msgFile, 'utf8') });
  } else {
    for (const rel of listCandidateFiles()) {
      const abs = join(repoRoot, rel);
      if (!existsSync(abs)) continue;
      const buf = readFileSync(abs);
      if (looksBinary(buf)) continue;
      targets.push({ label: rel, text: buf.toString('utf8') });
    }
  }

  let count = 0;
  for (const { label, text } of targets) {
    for (const hit of findTermHits(text, terms)) {
      console.error(`✗ ${label}:${hit.line} contains private term #${hit.termNo}`);
      count++;
    }
  }

  if (count > 0) {
    console.error(`\ncheck-private-terms: ${count} hit(s)`);
    process.exit(1);
  }

  console.log(`check-private-terms: ${targets.length} text source(s) clean`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
