import { basename } from 'node:path';
import { normalizePath, shouldProcessTexFile } from './tex-utils.mjs';

export const PACK_PREAMBLE_SITE_INPUT = String.raw`\input{../../../../_shared/pack_preamble.tex}`;
export const PACK_PREAMBLE_OVERLEAF_INPUT = String.raw`\input{preamble.tex}`;

const DOCUMENTCLASS_LINE = String.raw`\documentclass[leqno]{article}`;
const DUPLICATED_PREAMBLE_RE =
  /\\usepackage(?:\[[^\]]*\])?\{|\\usetikzlibrary\{|\\usepgfplotslibrary\{|\\pgfplotsset\{|\\RenewDocumentCommand\{\\marks\}|\\newcommand\{\\questionitem\}|\\definecolor\{scarlet\}/;

export function isFurtherMathsPackTexFile(relFromRepo) {
  const p = normalizePath(relFromRepo).toLowerCase();
  return (
    shouldProcessTexFile(p) &&
    p.startsWith('public/tex/further-maths/') &&
    (p.includes('/qbt/') || p.includes('/soln/'))
  );
}

export function packKindFromPath(relFromRepo) {
  const p = normalizePath(relFromRepo).toLowerCase();
  if (p.includes('/qbt/')) return 'qbt';
  if (p.includes('/soln/')) return 'soln';
  return null;
}

export function hasExpectedFurtherMathsPackDepth(relFromRepo) {
  const parts = normalizePath(relFromRepo).split('/');
  return (
    parts.length === 7 &&
    parts[0] === 'public' &&
    parts[1] === 'tex' &&
    parts[2] === 'further-maths' &&
    ['qbt', 'soln'].includes(parts[5])
  );
}

function detectEol(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > lf ? '\r\n' : '\n';
}

function splitLines(text) {
  return text.split(/\r?\n/);
}

function findBeginDocumentIndex(lines) {
  return lines.findIndex((line) => line.includes(String.raw`\begin{document}`));
}

function findFirstEnumerateIndex(lines, startIdx) {
  for (let i = startIdx; i < lines.length; i++) {
    if (/^\s*\\begin\{enumerate\}/.test(lines[i])) return i;
  }
  return -1;
}

function extractBraceArgument(line, command) {
  const tag = `\\${command}{`;
  const tagIdx = line.indexOf(tag);
  if (tagIdx < 0) return null;
  const start = tagIdx + tag.length;
  let depth = 1;
  let i = start;
  while (i < line.length && depth > 0) {
    const ch = line[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return line.slice(start, i - 1);
}

function stripSolutionsPrefix(headerText) {
  const prefix = String.raw`\textit{Solutions} - `;
  return headerText.startsWith(prefix)
    ? headerText.slice(prefix.length)
    : headerText;
}

function titleFromFilename(relFromRepo, kind) {
  const stem = basename(normalizePath(relFromRepo), '.tex');
  const raw =
    kind === 'soln'
      ? stem.replace(/^_QBT___Solns__/, '')
      : stem.replace(/^_QBT__/, '');
  return raw.replace(/_+/g, ' ').trim() || 'Topic';
}

function extractTopic(lines, relFromRepo, kind) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const arg = extractBraceArgument(lines[i], 'lhead');
    if (arg != null) return stripSolutionsPrefix(arg).trim();
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const qbtArg = extractBraceArgument(lines[i], 'djsQbtHeader');
    if (qbtArg != null) return qbtArg.trim();
    const solnArg = extractBraceArgument(lines[i], 'djsSolnHeader');
    if (solnArg != null) return solnArg.trim();
  }

  return titleFromFilename(relFromRepo, kind);
}

export function migratePackPreamble(text, relFromRepo) {
  const kind = packKindFromPath(relFromRepo);
  if (!kind) {
    throw new Error(`cannot determine pack kind from ${relFromRepo}`);
  }

  const eol = detectEol(text);
  const trailingNewline = /\r?\n$/.test(text);
  const lines = splitLines(text);
  const beginIdx = findBeginDocumentIndex(lines);
  if (beginIdx < 0) {
    throw new Error('missing \\begin{document}');
  }

  const enumIdx = findFirstEnumerateIndex(lines, beginIdx + 1);
  if (enumIdx < 0) {
    throw new Error('missing outer \\begin{enumerate}');
  }

  const preDocLines = lines.slice(0, beginIdx);
  const topic = extractTopic(preDocLines, relFromRepo, kind);
  const header =
    kind === 'soln'
      ? String.raw`\djsSolnHeader{${topic}}`
      : String.raw`\djsQbtHeader{${topic}}`;

  const migrated = [
    DOCUMENTCLASS_LINE,
    PACK_PREAMBLE_SITE_INPUT,
    '',
    header,
    '',
    String.raw`\begin{document}`,
    String.raw`\djsFrontMatter`,
    ...lines.slice(enumIdx),
  ].join(eol);

  return trailingNewline ? migrated.replace(/\r?\n?$/, eol) : migrated;
}

export function normalizeImportedPackTex(text, relFromRepo) {
  if (text.includes(PACK_PREAMBLE_SITE_INPUT)) return text;
  if (text.includes(PACK_PREAMBLE_OVERLEAF_INPUT)) {
    return text.replaceAll(PACK_PREAMBLE_OVERLEAF_INPUT, PACK_PREAMBLE_SITE_INPUT);
  }
  return migratePackPreamble(text, relFromRepo);
}

export function usesOverleafPackInput(text) {
  return text.includes(PACK_PREAMBLE_OVERLEAF_INPUT);
}

function countMatches(text, re) {
  return [...text.matchAll(re)].length;
}

export function checkPackPreambleConvention(text, relFromRepo) {
  const rel = normalizePath(relFromRepo);
  /** @type {{ kind: string; message: string }[]} */
  const violations = [];

  if (!isFurtherMathsPackTexFile(rel)) return violations;

  const kind = packKindFromPath(rel);
  if (!hasExpectedFurtherMathsPackDepth(rel)) {
    violations.push({
      kind: 'bad-depth',
      message: `${rel}: expected public/tex/further-maths/<strand>/<topic>/{qbt,soln}/<file>.tex`,
    });
  }

  const siteInputCount = countMatches(
    text,
    /\\input\{\.\.\/\.\.\/\.\.\/\.\.\/_shared\/pack_preamble\.tex\}/g,
  );
  if (siteInputCount !== 1) {
    violations.push({
      kind: 'missing-shared-input',
      message: `${rel}: expected exactly one ${PACK_PREAMBLE_SITE_INPUT}`,
    });
  }
  if (usesOverleafPackInput(text)) {
    violations.push({
      kind: 'overleaf-input',
      message: `${rel}: site source must use ${PACK_PREAMBLE_SITE_INPUT}, not ${PACK_PREAMBLE_OVERLEAF_INPUT}`,
    });
  }

  const qbtHeaders = countMatches(text, /\\djsQbtHeader\{/g);
  const solnHeaders = countMatches(text, /\\djsSolnHeader\{/g);
  if (qbtHeaders + solnHeaders !== 1) {
    violations.push({
      kind: 'bad-header',
      message: `${rel}: expected exactly one \\djsQbtHeader{} or \\djsSolnHeader{}`,
    });
  } else if (kind === 'qbt' && qbtHeaders !== 1) {
    violations.push({
      kind: 'wrong-header',
      message: `${rel}: qbt files must use \\djsQbtHeader{}`,
    });
  } else if (kind === 'soln' && solnHeaders !== 1) {
    violations.push({
      kind: 'wrong-header',
      message: `${rel}: soln files must use \\djsSolnHeader{}`,
    });
  }

  const lines = splitLines(text);
  const beginIdx = findBeginDocumentIndex(lines);
  const preDoc = beginIdx >= 0 ? lines.slice(0, beginIdx).join('\n') : text;
  if (DUPLICATED_PREAMBLE_RE.test(preDoc)) {
    violations.push({
      kind: 'duplicated-preamble',
      message: `${rel}: inline package/macro preamble remains before \\begin{document}`,
    });
  }

  return violations;
}
