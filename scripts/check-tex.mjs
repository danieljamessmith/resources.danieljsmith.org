/**
 * Read-only lint: body of QBT/soln .tex files must not contain full-line
 * comments except clean question delimiters inserted by clean-tex.mjs.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const texRoot = join(repoRoot, 'public', 'tex');

const ALLOWED_FULL_LINE_COMMENT = /^\s*% ---- Question \d+ ----\s*$/;

function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

function shouldProcessTexFile(relFromRepo) {
  const p = normalizePath(relFromRepo).toLowerCase();
  if (!p.endsWith('.tex')) return false;
  if (p.includes('/notes/')) return false;
  return p.includes('/qbt/') || p.includes('/soln/');
}

function walkTexFiles(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTexFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.tex')) {
      const rel = relative(repoRoot, full);
      if (shouldProcessTexFile(rel)) acc.push(full);
    }
  }
}

function findDocBoundaries(lines) {
  let beginIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (beginIdx < 0 && lines[i].includes('\\begin{document}')) beginIdx = i;
    if (lines[i].includes('\\end{document}')) {
      endIdx = i;
      break;
    }
  }
  return { beginIdx, endIdx };
}

function isUnexpectedFullLineComment(line) {
  const t = line.trimStart();
  if (t.length === 0 || t[0] !== '%') return false;
  return !ALLOWED_FULL_LINE_COMMENT.test(line);
}

function main() {
  const files = [];
  walkTexFiles(texRoot, files);
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

main();
