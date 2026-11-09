/**
 * Read-only check that a commit message carries no attribution line. The
 * site's commits are the maintainer's and say nothing about how they were
 * made, so a message is refused when a line holds a co-author trailer
 * (`Co-Authored-By:`) or the phrase "generated with", in any case. The
 * phrase is matched as words: "the generated PDF" and "Regenerated with"
 * pass. Lines below git's scissors line, which git cuts off (the diff that
 * `commit --verbose` shows), are not part of the message and are not read.
 *
 * Everything else in the message is the private-terms check's.
 *
 * Usage:
 *   node scripts/check-commit-message.mjs FILE   # exits 1 on an attribution line
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ATTRIBUTION = [/co-authored-by:/i, /\bgenerated\s+with\b/i];
const SCISSORS = /^\S -{24} >8 -{24}$/;

/**
 * The first line of `message` that is an attribution line, numbered from 1,
 * or null when there is none.
 *
 * @param {string} message
 * @returns {{ line: number } | null}
 */
export function attributionLine(message) {
  const lines = message.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (SCISSORS.test(lines[i])) break;
    if (ATTRIBUTION.some((pattern) => pattern.test(lines[i]))) return { line: i + 1 };
  }
  return null;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('check-commit-message: name the commit message file');
    process.exit(2);
  }
  const found = attributionLine(readFileSync(file, 'utf8'));
  if (found) {
    console.error(
      `check-commit-message: line ${found.line} is an attribution line (Co-Authored-By or "generated with"); remove it`,
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
