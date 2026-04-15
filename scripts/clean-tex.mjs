/**
 * Strips full-line comments from the document body of QBT/soln .tex files,
 * collapses long blank runs, and re-inserts numbered question delimiters.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath, shouldProcessTexFile, walkTexFiles, findDocBoundaries } from './lib/tex-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const texRoot = join(repoRoot, 'public', 'tex');

const QUESTION_ITEM_LINE = /^\s*\\questionitem\s*$/;

/** Returns true if the line consists entirely of a LaTeX comment. */
export function isFullLineComment(line) {
  const t = line.trimStart();
  return t.length > 0 && t[0] === '%';
}

/** Removes all full-line comment lines from `bodyLines`. */
export function stripBodyLines(bodyLines) {
  return bodyLines.filter((line) => !isFullLineComment(line));
}

/**
 * Collapses runs of more than two consecutive blank lines down to two.
 * @param {string[]} bodyLines
 */
export function collapseBlankRuns(bodyLines) {
  const out = [];
  let blankRun = 0;
  for (const line of bodyLines) {
    const isBlank = line.trim() === '';
    if (isBlank) {
      blankRun++;
      if (blankRun <= 2) out.push(line);
    } else {
      blankRun = 0;
      out.push(line);
    }
  }
  return out;
}

/**
 * Inserts a `% ---- Question N ----` delimiter before each `\questionitem`
 * line, with sequential numbering.
 * @param {string[]} bodyLines
 */
export function insertQuestionDelimiters(bodyLines) {
  const out = [];
  let n = 0;
  for (const line of bodyLines) {
    if (QUESTION_ITEM_LINE.test(line)) {
      n++;
      out.push(`% ---- Question ${n} ----`);
    }
    out.push(line);
  }
  return out;
}

/**
 * Processes the full text of a .tex file: strips body comments, collapses
 * blank runs, and inserts question delimiters.
 * @param {string} text
 * @returns {string}
 */
export function processContent(text) {
  const lines = text.split(/\r?\n/);
  const { beginIdx, endIdx } = findDocBoundaries(lines);
  if (beginIdx < 0 || endIdx < 0) {
    throw new Error('missing \\begin{document} or \\end{document}');
  }

  const preamble = lines.slice(0, beginIdx + 1);
  const bodyRaw = lines.slice(beginIdx + 1, endIdx);
  const closing = lines.slice(endIdx);

  const stripped = stripBodyLines(bodyRaw);
  const collapsed = collapseBlankRuns(stripped);
  const bodyOut = insertQuestionDelimiters(collapsed);

  return [...preamble, ...bodyOut, ...closing].join('\n');
}

function main() {
  const files = walkTexFiles(texRoot, repoRoot, shouldProcessTexFile);
  files.sort();

  let totalComments = 0;
  let fileCount = 0;

  for (const absPath of files) {
    const rel = normalizePath(relative(repoRoot, absPath));
    let text;
    try {
      text = readFileSync(absPath, 'utf8');
    } catch (e) {
      console.error(`clean-tex: read failed: ${rel}`, e);
      process.exit(1);
    }

    const lines = text.split(/\r?\n/);
    const { beginIdx, endIdx } = findDocBoundaries(lines);
    if (beginIdx < 0 || endIdx < 0) {
      console.error(`clean-tex: ${rel}: missing \\begin{document} or \\end{document}`);
      process.exit(1);
    }
    const bodyRaw = lines.slice(beginIdx + 1, endIdx);
    let removed = 0;
    for (const line of bodyRaw) {
      if (isFullLineComment(line)) removed++;
    }

    let out;
    try {
      out = processContent(text);
    } catch (e) {
      console.error(`clean-tex: ${rel}:`, e.message || e);
      process.exit(1);
    }

    try {
      writeFileSync(absPath, out, 'utf8');
    } catch (e) {
      console.error(`clean-tex: write failed: ${rel}`, e);
      process.exit(1);
    }

    fileCount++;
    totalComments += removed;
    console.log(`${rel}: removed ${removed} comment line(s)`);
  }

  console.log(`clean-tex: ${fileCount} file(s), ${totalComments} comment line(s) removed total`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
