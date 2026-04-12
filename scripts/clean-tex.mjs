/**
 * Strips full-line comments from the document body of QBT/soln .tex files,
 * collapses long blank runs, and re-inserts numbered question delimiters.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const texRoot = join(repoRoot, 'public', 'tex');

const QUESTION_ITEM_LINE = /^\s*\\questionitem\s*$/;

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

function isFullLineComment(line) {
  const t = line.trimStart();
  return t.length > 0 && t[0] === '%';
}

function stripBodyLines(bodyLines) {
  return bodyLines.filter((line) => !isFullLineComment(line));
}

function collapseBlankRuns(bodyLines) {
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

function insertQuestionDelimiters(bodyLines) {
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

function processContent(text) {
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
  const files = [];
  walkTexFiles(texRoot, files);
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

main();
