/**
 * Read-only check that no private term appears in tracked (or new, unignored)
 * files, or in a commit message. Text files are read as they are; PDFs by the
 * text their pages show and the strings they carry (`lib/pdf-text.mjs`).
 * Other binary files are skipped.
 *
 * The term list is deliberately kept out of the repo. It is read from, in
 * order:
 *   1. the PRIVATE_TERMS environment variable (newline- or comma-separated;
 *      CI supplies it from a repository secret)
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

import { parseTermList, findTermHits, looksBinary } from './lib/private-terms.mjs';
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
    for (const rel of listCandidateFiles()) {
      const abs = join(repoRoot, rel);
      if (!existsSync(abs)) continue;
      const buf = readFileSync(abs);
      if (rel.toLowerCase().endsWith('.pdf')) {
        targets.push({ label: rel, text: pdfText(buf), lines: false });
      } else if (!looksBinary(buf)) {
        targets.push({ label: rel, text: buf.toString('utf8'), lines: true });
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
