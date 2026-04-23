/**
 * Read-only lint: body of QBT/soln .tex files must not contain full-line
 * comments except clean question delimiters inserted by clean-tex.mjs.
 */

import { readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath, shouldProcessTexFile, walkTexFiles, findDocBoundaries } from './lib/tex-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const texRoot = join(repoRoot, 'public', 'tex');

const ALLOWED_FULL_LINE_COMMENTS = [
  /^\s*% ---- Question \d+ ----\s*$/,
  /^\s*% \[Source: [A-Za-z0-9_]+, Q\d+\]\s*$/,
];

/**
 * Returns true if a line is a full-line comment that is NOT a permitted
 * question delimiter or source hint.
 * @param {string} line
 */
export function isUnexpectedFullLineComment(line) {
  const t = line.trimStart();
  if (t.length === 0 || t[0] !== '%') return false;
  return !ALLOWED_FULL_LINE_COMMENTS.some((re) => re.test(line));
}

function main() {
  const files = walkTexFiles(texRoot, repoRoot, shouldProcessTexFile);
  files.sort();

  /** @type {{ file: string; line: number; text: string }[]} */
  const violations = [];

  for (const absPath of files) {
    const rel = normalizePath(relative(repoRoot, absPath));
    let text;
    try {
      text = readFileSync(absPath, 'utf8');
    } catch (e) {
      console.error(`check-tex: read failed: ${rel}`, e);
      process.exit(1);
    }

    const lines = text.split(/\r?\n/);
    const { beginIdx, endIdx } = findDocBoundaries(lines);
    if (beginIdx < 0 || endIdx < 0) {
      console.error(`check-tex: ${rel}: missing \\begin{document} or \\end{document}`);
      process.exit(1);
    }

    const bodyLines = lines.slice(beginIdx + 1, endIdx);
    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      if (isUnexpectedFullLineComment(line)) {
        const lineNo = beginIdx + 2 + i;
        violations.push({ file: rel, line: lineNo, text: line });
      }
    }
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`${v.file}:${v.line}: ${v.text}`);
    }
    console.error(`check-tex: ${violations.length} violation(s)`);
    process.exit(1);
  }

  console.log('check-tex: all clean');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
