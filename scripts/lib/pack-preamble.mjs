import { basename } from 'node:path';
import { normalizePath, shouldProcessTexFile } from './tex-utils.mjs';

export const PACK_PREAMBLE_SITE_INPUT = String.raw`\input{../../../../_shared/pack_preamble.tex}`;
export const PACK_PREAMBLE_OVERLEAF_INPUT = String.raw`\input{preamble.tex}`;

const DOCUMENTCLASS_LINE = String.raw`\documentclass[leqno]{article}`;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DATE_COMMAND = String.raw`\djsLastUpdated`;
const SITE_PATH_COMMAND = String.raw`\djsSitePath`;

export function formatPackDate(day = new Date()) {
  return `${day.getDate()} ${MONTHS[day.getMonth()]} ${day.getFullYear()}`;
}

export function isValidPackDate(value) {
  const match = /^([1-9]|[12]\d|3[01]) ([A-Za-z]+) ([1-9]\d{3})$/.exec(value);
  if (!match) return false;
  const month = MONTHS.indexOf(match[2]);
  if (month < 0) return false;
  const day = new Date(Number(match[3]), month, Number(match[1]));
  return formatPackDate(day) === value;
}

/** Date calls in code only, with their location relative to the document. */
function packDateCalls(text) {
  const code = text.replace(/(?<!\\)%[^\r\n]*/g, '');
  const begin = code.indexOf(String.raw`\begin{document}`);
  return [...code.matchAll(/\\djsLastUpdated\b/g)].map((match) => {
    const argument = /^\{([^{}\r\n]*)\}/.exec(code.slice(match.index + DATE_COMMAND.length));
    return {
      value: argument?.[1] ?? null,
      inPreamble: begin >= 0 && match.index < begin,
    };
  });
}

/**
 * `\djsSitePath` calls in code only: their two arguments (null when the call
 * is not followed by two brace groups) and whether they sit in the preamble.
 */
function packSitePathCalls(text) {
  const code = text.replace(/(?<!\\)%[^\r\n]*/g, '');
  const begin = code.indexOf(String.raw`\begin{document}`);
  return [...code.matchAll(/\\djsSitePath\b/g)].map((match) => {
    const args = /^\{([^{}\r\n]*)\}\{([^{}\r\n]*)\}/.exec(
      code.slice(match.index + SITE_PATH_COMMAND.length),
    );
    return {
      strand: args?.[1] ?? null,
      section: args?.[2] ?? null,
      inPreamble: begin >= 0 && match.index < begin,
    };
  });
}

/**
 * Escape plain text (a site title or label) for a header or site-path
 * argument. Covers the characters titles use; not a general escaper.
 */
export function texEscapeText(text) {
  return text.replace(/([&%$#_{}])/g, '\\$1');
}

/** Undo `texEscapeText`. */
export function texUnescapeText(text) {
  return text.replace(/\\([&%$#_{}])/g, '$1');
}

/**
 * A pack's title (its header's topic) and site path, as plain text.
 *
 * @param {string} text
 * @returns {{ title: string | null; sitePath: { strand: string; section: string } | null }}
 */
export function readPackIdentity(text) {
  const lines = splitLines(text);
  const beginIdx = findBeginDocumentIndex(lines);
  const preDoc = beginIdx >= 0 ? lines.slice(0, beginIdx) : lines;
  let title = null;
  for (const line of preDoc) {
    if (/^\s*%/.test(line)) continue;
    const arg =
      extractBraceArgument(line, 'djsQbtHeader') ?? extractBraceArgument(line, 'djsSolnHeader');
    if (arg != null) {
      title = texUnescapeText(arg.trim());
      break;
    }
  }
  const calls = packSitePathCalls(text).filter((c) => c.inPreamble && c.strand !== null);
  const sitePath =
    calls.length === 1
      ? { strand: texUnescapeText(calls[0].strand), section: texUnescapeText(calls[0].section) }
      : null;
  return { title, sitePath };
}

/**
 * Set a pack's header topic to `title` and its `\djsSitePath` to `strand` and
 * `section` (both plain text), keeping everything else. The site path goes on
 * the line after the header, replacing any earlier one. Omit `title` to keep
 * the header, or `strand` to leave the site path alone.
 *
 * @param {string} text
 * @param {{ title?: string; strand?: string; section?: string }} identity
 */
export function applyPackIdentity(text, { title, strand, section }) {
  const eol = detectEol(text);
  let lines = splitLines(text);
  const isSitePathLine = (line) => line.trimStart().startsWith(`${SITE_PATH_COMMAND}{`);
  const beginIdx = findBeginDocumentIndex(lines);
  if (beginIdx < 0) throw new Error('missing \\begin{document}');
  if (strand !== undefined) {
    lines = lines.filter((line, i) => i >= beginIdx || !isSitePathLine(line));
  }

  const headerIdx = lines.findIndex(
    (line) => /^\s*\\djs(?:Qbt|Soln)Header\{/.test(line),
  );
  if (headerIdx < 0 || headerIdx >= findBeginDocumentIndex(lines)) {
    throw new Error('missing \\djsQbtHeader{} or \\djsSolnHeader{} before \\begin{document}');
  }

  if (title !== undefined) {
    const command = lines[headerIdx].includes('\\djsSolnHeader{') ? 'djsSolnHeader' : 'djsQbtHeader';
    const old = extractBraceArgument(lines[headerIdx], command);
    lines[headerIdx] = lines[headerIdx].replace(
      `\\${command}{${old}}`,
      () => `\\${command}{${texEscapeText(title)}}`,
    );
  }
  if (strand !== undefined) {
    lines.splice(
      headerIdx + 1,
      0,
      `${SITE_PATH_COMMAND}{${texEscapeText(strand)}}{${texEscapeText(section ?? '')}}`,
    );
  }
  return lines.join(eol);
}

/** Initialise an undated import; preserve its existing date without refreshing it. */
export function initialisePackDate(text, initialDate = formatPackDate()) {
  const calls = packDateCalls(text);
  if (calls.length > 0) {
    if (calls.length !== 1 || !calls[0].inPreamble || !isValidPackDate(calls[0].value)) {
      throw new Error('expected one valid \\djsLastUpdated{D Month YYYY} before \\begin{document}');
    }
    return text;
  }
  if (!isValidPackDate(initialDate)) throw new Error(`invalid pack date: ${initialDate}`);
  const eol = detectEol(text);
  const lines = splitLines(text);
  const begin = findBeginDocumentIndex(lines);
  if (begin < 0) throw new Error('missing \\begin{document}');
  lines.splice(begin, 0, `${DATE_COMMAND}{${initialDate}}`);
  return lines.join(eol);
}
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

export function migratePackPreamble(text, relFromRepo, initialDate = formatPackDate()) {
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
  const dated = initialisePackDate(text, initialDate);
  const lastUpdated = packDateCalls(dated)[0].value;
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
    `${DATE_COMMAND}{${lastUpdated}}`,
    '',
    String.raw`\begin{document}`,
    String.raw`\djsFrontMatter`,
    ...lines.slice(enumIdx),
  ].join(eol);

  return trailingNewline ? migrated.replace(/\r?\n?$/, eol) : migrated;
}

/**
 * Bring an imported pack into the site wrapper. With `identity`, also set its
 * header topic and site path (see `applyPackIdentity`).
 */
export function normalizeImportedPackTex(
  text, relFromRepo, initialDate = formatPackDate(), identity = undefined,
) {
  let out;
  if (text.includes(PACK_PREAMBLE_SITE_INPUT)) {
    out = initialisePackDate(text, initialDate);
  } else if (text.includes(PACK_PREAMBLE_OVERLEAF_INPUT)) {
    out = initialisePackDate(
      text.replaceAll(PACK_PREAMBLE_OVERLEAF_INPUT, PACK_PREAMBLE_SITE_INPUT), initialDate,
    );
  } else {
    out = migratePackPreamble(text, relFromRepo, initialDate);
  }
  return identity ? applyPackIdentity(out, identity) : out;
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
  const dateCalls = packDateCalls(text);
  if (dateCalls.length !== 1 || !dateCalls[0].inPreamble || !isValidPackDate(dateCalls[0].value)) {
    violations.push({
      kind: 'bad-last-updated',
      message: `${rel}: expected one valid \\djsLastUpdated{D Month YYYY} before \\begin{document}`,
    });
  }
  const sitePathCalls = packSitePathCalls(text);
  if (
    sitePathCalls.length > 1 ||
    sitePathCalls.some((c) => !c.inPreamble || !c.strand || !c.section)
  ) {
    violations.push({
      kind: 'bad-site-path',
      message: `${rel}: expected at most one \\djsSitePath{<strand>}{<topic>} before \\begin{document}`,
    });
  }
  if (DUPLICATED_PREAMBLE_RE.test(preDoc)) {
    violations.push({
      kind: 'duplicated-preamble',
      message: `${rel}: inline package/macro preamble remains before \\begin{document}`,
    });
  }

  return violations;
}
