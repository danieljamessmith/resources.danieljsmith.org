/**
 * Derive ids / categories / sibling anchors by scanning `src/data/resources.ts` with regex
 * (no full TypeScript parse), and the Further Maths strands, topic sections and
 * board lists from `src/data/topics.ts` and `src/data/resources.ts` the same way.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

/** @param {string} s */
export function slugify(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

/**
 * @param {string} slug - kebab-case slug (topic segment)
 */
export function deriveTopicSlugTitle(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * @param {string} idPrefix - e.g. `fm-vectors-`
 * @param {string} topicName - human topic title
 */
export function deriveTopicId(idPrefix, topicName) {
  const tail = slugify(topicName);
  return `${idPrefix}${tail}`;
}

/**
 * A row's `category` as written (`FM_CP`, `'TMUA'`) to its label.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeCategoryToken(raw) {
  const t = raw.trim();
  if (t === 'FM_CP') return 'FM - Core Pure';
  if (t === 'FM_MECH') return 'FM - Further Mechanics';
  const m = t.match(/^'([^']*)'$/);
  if (m) return m[1];
  return t;
}

/**
 * @param {string} filePath - `/tex/...`
 * @returns {string | null} site path under tex, e.g. further-maths/core-pure/vectors
 */
export function fileToSitePath(filePath) {
  const m = filePath.match(/^\/tex\/(.+)\/(?:qbt|soln|notes)\//);
  return m ? m[1].replace(/\\/g, '/') : null;
}

/**
 * `src` with the contents of string literals and comments replaced by spaces,
 * so code-level searches can't match inside them. Quotes and line breaks are
 * kept, so indices and line numbers still match `src`. Sufficient for the
 * hand-written data files in `src/data/` (no template-string interpolation,
 * no regex literals).
 *
 * @param {string} src
 * @returns {string}
 */
export function maskStringsAndComments(src) {
  const out = src.split('');
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  const blank = (i) => {
    if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      else blank(i);
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        blank(i);
        blank(i + 1);
        i++;
      } else {
        blank(i);
      }
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        blank(i);
        blank(i + 1);
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      else blank(i);
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      blank(i);
      blank(i + 1);
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      blank(i);
      blank(i + 1);
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') inString = ch;
  }
  return out.join('');
}

/**
 * Find the index of the bracket that closes the one at `openIdx` (`[`, `{` or
 * `(`), ignoring brackets inside string literals and comments.
 *
 * @param {string} src
 * @param {number} openIdx - index of the opening bracket
 * @returns {number} index of the matching close, or -1 if unbalanced
 */
export function findMatchingClose(src, openIdx) {
  const open = src[openIdx];
  const close = { '[': ']', '{': '}', '(': ')' }[open];
  if (!close) return -1;
  const code = maskStringsAndComments(src);
  let depth = 0;
  for (let i = openIdx; i < code.length; i++) {
    if (code[i] === open) depth++;
    else if (code[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const RAW_RESOURCES_START = /const\s+rawResources\s*(?::\s*Resource\[\])?\s*=\s*\[/;

/**
 * The `rawResources` array literal in `src/data/resources.ts`: the indices of
 * its `[` and matching `]`, or null when it can't be found.
 *
 * @param {string} resourcesTsContent
 * @returns {{ open: number; close: number } | null}
 */
export function findRawResources(resourcesTsContent) {
  const m = resourcesTsContent.match(RAW_RESOURCES_START);
  if (!m || m.index === undefined) return null;
  const open = m.index + m[0].length - 1;
  const close = findMatchingClose(resourcesTsContent, open);
  return close === -1 ? null : { open, close };
}

/**
 * A single- or double-quoted string literal, allowing escaped characters. It
 * has two capture groups, one per quote style; read it with `tsStringValue`.
 */
const TS_STRING = String.raw`(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")`;

/**
 * The value of a `TS_STRING` match, given the match and its first group index.
 * @param {RegExpMatchArray} m
 * @param {number} group
 */
function tsStringValue(m, group) {
  return (m[group] ?? m[group + 1] ?? '').replace(/\\(.)/g, '$1');
}

/**
 * @typedef {Object} ResourceEntry
 * @property {string} id
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} file        - `/tex/...` URL path
 * @property {string} category    - Normalised label (e.g. `'FM - Core Pure'`)
 * @property {string} [topic]
 * @property {'questions'|'solutions'|'answers'|'markscheme'|'notes'} [type]
 * @property {string} [pairId]    - id of the partner entry in a {Q, S} pair
 * @property {string} [paperId]   - on an `answers` or `markscheme` entry: the id
 *                                  of its questions entry
 * @property {string[]} [boards]  - exam board ids; absent means all boards
 */

/**
 * @param {string} resourcesTsContent
 * @returns {ResourceEntry[]}
 */
export function parseResourcesEntries(resourcesTsContent) {
  const range = findRawResources(resourcesTsContent);
  if (!range) return [];

  const inner = resourcesTsContent.slice(range.open + 1, range.close);
  const entries = [];
  const blockRe =
    /\{\s*id:\s*'([^']+)'[\s\S]{0,12000}?file:\s*'(\/tex\/[^']+)'[\s\S]{0,12000}?\n\s*\},?/g;
  let m;
  while ((m = blockRe.exec(inner)) !== null) {
    const block = m[0];
    const id = m[1];
    const file = m[2];
    const catRaw = block.match(/category:\s*([^,\n]+?)\s*,/);
    const titleM = block.match(new RegExp(String.raw`title:\s*${TS_STRING}`));
    const descriptionM = block.match(new RegExp(String.raw`description:\s*${TS_STRING}`));
    const topicM = block.match(/topic:\s*'([^']*)'/);
    const typeM = block.match(/type:\s*'([^']+)'/);
    const pairM = block.match(/pairId:\s*'([^']+)'/);
    const paperM = block.match(/paperId:\s*'([^']+)'/);
    const boardsM = block.match(/boards:\s*\[([^\]]*)\]/);
    const category = catRaw ? normalizeCategoryToken(catRaw[1]) : 'unknown';
    entries.push({
      id,
      title: titleM ? tsStringValue(titleM, 1) : undefined,
      description: descriptionM ? tsStringValue(descriptionM, 1) : undefined,
      file,
      category,
      topic: topicM ? topicM[1] : undefined,
      type: typeM ? typeM[1] : undefined,
      pairId: pairM ? pairM[1] : undefined,
      paperId: paperM ? paperM[1] : undefined,
      boards: boardsM ? [...boardsM[1].matchAll(/'([^']*)'/g)].map((b) => b[1]) : undefined,
    });
  }
  return entries;
}

/**
 * Every `id:` key in the `rawResources` array, as written: its value (read
 * from either quote style, or the raw text when it isn't a string literal)
 * and its 1-based line. `parseResourcesEntries` silently skips a row it can't
 * read, so comparing the two finds rows the site would lose.
 *
 * @param {string} resourcesTsContent
 * @returns {{ id: string; line: number }[]}
 */
export function catalogueIdKeys(resourcesTsContent) {
  const range = findRawResources(resourcesTsContent);
  if (!range) return [];
  const code = maskStringsAndComments(resourcesTsContent);
  const keyRe = /(?<![\w$.])id\s*:/g;
  keyRe.lastIndex = range.open;
  const keys = [];
  let m;
  while ((m = keyRe.exec(code)) !== null && m.index < range.close) {
    const rest = resourcesTsContent.slice(m.index + m[0].length);
    const value = rest.match(new RegExp(String.raw`^\s*${TS_STRING}`));
    const raw = value ? tsStringValue(value, 1) : rest.match(/^\s*([^,\n}]*)/)[1].trim();
    const line = resourcesTsContent.slice(0, m.index).split('\n').length;
    keys.push({ id: raw, line });
  }
  return keys;
}

/**
 * The exam board lists exported from `src/data/resources.ts`
 * (`export const EXAM_BOARDS: … = [{ id: 'edexcel', … }, …]`), by constant name.
 *
 * @param {string} resourcesTsContent
 * @returns {Map<string, string[]>}
 */
export function parseBoardLists(resourcesTsContent) {
  const lists = new Map();
  const headRe = /export\s+const\s+([A-Z_]+)\s*:\s*\{\s*id:\s*ExamBoard\b[^=]*=\s*\[/g;
  let m;
  while ((m = headRe.exec(resourcesTsContent)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = findMatchingClose(resourcesTsContent, open);
    if (close === -1) continue;
    const body = resourcesTsContent.slice(open + 1, close);
    lists.set(m[1], [...body.matchAll(/\bid:\s*'([^']+)'/g)].map((b) => b[1]));
  }
  return lists;
}

/**
 * @param {string} [resourcesPath]
 */
export function loadResourcesEntries(resourcesPath = join(repoRoot, 'src', 'data', 'resources.ts')) {
  const content = readFileSync(resourcesPath, 'utf8');
  return parseResourcesEntries(content);
}

/**
 * @typedef {Object} Strand
 * @property {string} category  - Normalised label (e.g. `'FM - Core Pure'`)
 * @property {string} title     - Strand title (e.g. `'Core Pure'`)
 * @property {string} [folder]  - Its folder under `public/tex/further-maths/`
 *                                (the last segment of its `href`)
 * @property {string} [boardsConst] - Name of its board list (e.g. `EXAM_BOARDS`)
 * @property {string[]} [boards] - Its board ids, when the list was resolved
 * @property {{ id: string; topic: string; title: string }[]} topics
 *   - `topic` is the `Resource.topic` value; `title` is the section heading
 */

/**
 * Parses the `STRANDS` array in `src/data/topics.ts`. With `boardLists` (from
 * `parseBoardLists`), each strand's `boards` constant is resolved to its ids.
 *
 * @param {string} topicsTsContent
 * @param {Map<string, string[]>} [boardLists]
 * @returns {Strand[]}
 */
export function parseStrands(topicsTsContent, boardLists) {
  const start = topicsTsContent.search(/export\s+const\s+STRANDS\b/);
  if (start < 0) return [];
  const body = topicsTsContent.slice(start);
  const heads = [
    ...body.matchAll(
      new RegExp(String.raw`category:\s*([A-Z_]+|'[^']*')\s*,\s*title:\s*${TS_STRING}`, 'g'),
    ),
  ];
  const topicRe = new RegExp(
    String.raw`\{\s*id:\s*'([^']+)',\s*topic:\s*${TS_STRING},\s*title:\s*${TS_STRING}`,
    'g',
  );
  return heads.map((head, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : body.length;
    const segment = body.slice(head.index, end);
    const href = segment.match(/href:\s*'([^']*)'/)?.[1];
    const boardsConst = segment.match(/boards:\s*([A-Z_]+)\s*,/)?.[1];
    const strand = {
      category: normalizeCategoryToken(head[1]),
      title: tsStringValue(head, 2),
      topics: [...segment.matchAll(topicRe)].map((t) => ({
        id: t[1],
        topic: tsStringValue(t, 2),
        title: tsStringValue(t, 4),
      })),
    };
    if (href) strand.folder = href.split('/').filter(Boolean).pop();
    if (boardsConst) {
      strand.boardsConst = boardsConst;
      const ids = boardLists?.get(boardsConst);
      if (ids) strand.boards = ids;
    }
    return strand;
  });
}

/**
 * Parses `src/data/topics.ts`, with each strand's board ids resolved from
 * `src/data/resources.ts`.
 *
 * @param {string} [topicsPath]
 * @param {string} [resourcesPath]
 */
export function loadStrands(
  topicsPath = join(repoRoot, 'src', 'data', 'topics.ts'),
  resourcesPath = join(repoRoot, 'src', 'data', 'resources.ts'),
) {
  return parseStrands(
    readFileSync(topicsPath, 'utf8'),
    parseBoardLists(readFileSync(resourcesPath, 'utf8')),
  );
}

/**
 * A topic section of `strand` named by its `Resource.topic` value or its
 * section heading, or undefined.
 *
 * @param {Strand} strand
 * @param {string} name
 */
export function findStrandTopic(strand, name) {
  const want = name.trim();
  return strand.topics.find((t) => t.topic === want) ?? strand.topics.find((t) => t.title === want);
}

/**
 * The strand and topic a pack's `\djsSitePath` should name: the strand title
 * and the topic's section heading on the strand page. A topic not yet listed
 * in `topics.ts` keeps its `Resource.topic` value.
 *
 * @param {Strand[]} strands
 * @param {string} category
 * @param {string | undefined} topic
 * @returns {{ strand: string; section: string } | null} null outside the strands
 */
export function sitePathLabels(strands, category, topic) {
  const strand = strands.find((s) => s.category === category);
  if (!strand || !topic) return null;
  const listed = strand.topics.find((t) => t.topic === topic);
  return { strand: strand.title, section: listed ? listed.title : topic };
}

/**
 * Longest common prefix of non-empty strings.
 * @param {string[]} strings
 */
function longestCommonPrefix(strings) {
  if (strings.length === 0) return '';
  let p = strings[0];
  for (const s of strings) {
    const max = Math.min(p.length, s.length);
    let i = 0;
    while (i < max && p[i] === s[i]) i++;
    p = p.slice(0, i);
    if (!p) return '';
  }
  return p;
}

/**
 * Trim a prefix back to the last `-` boundary so we don't keep partial slug fragments
 * (e.g. `fm-vec` from `fm-vectors-...` and `fm-vector-product-...`).
 * @param {string} p
 */
function trimToBoundary(p) {
  const i = p.lastIndexOf('-');
  return i >= 0 ? p.slice(0, i + 1) : p;
}

/**
 * Cut `prefix` back to just after the first of `slugs` it holds as whole
 * `-`-segments, when it runs on past it: the packs in a folder can share
 * opening words after the section's own slug
 * (`…-centre-of-mass-centre-of-mass-of-`).
 *
 * @param {string} prefix - ends with `-`
 * @param {string[]} slugs - the section's slugs, in order of preference
 */
function cutAfterSectionSlug(prefix, slugs) {
  const segs = prefix.split('-').slice(0, -1);
  for (const slug of slugs) {
    const want = slug.split('-').filter(Boolean);
    if (want.length === 0) continue;
    for (let i = 0; i + want.length < segs.length; i++) {
      if (want.every((w, j) => segs[i + j] === w)) return `${segs.slice(0, i + want.length).join('-')}-`;
    }
  }
  return prefix;
}

/**
 * Derive an id prefix shared by sibling entries.
 * - Multiple siblings: longest common prefix, trimmed to the last `-` boundary,
 *   then cut back to the section's slug (its folder's name or its topic's slug)
 *   if it runs on past it.
 * - Single sibling: try to find the topic-slug as a contiguous run of `-`-segments
 *   inside the id, and slice through it. Falls back to dropping the trailing
 *   `-solns` and the last segment.
 *
 * @param {string[]} ids
 * @param {string} [topic] - human topic title for the sibling group
 * @param {string} [folder] - the section folder's name
 * @returns {string}
 */
function deriveIdPrefixFromSiblingIds(ids, topic, folder) {
  if (ids.length === 0) return '';
  if (ids.length > 1) {
    const lcp = trimToBoundary(longestCommonPrefix(ids));
    return cutAfterSectionSlug(lcp, [folder, topic].filter(Boolean).map(slugify));
  }

  const id = ids[0];
  const stripped = id.replace(/-solns$/, '');
  const segs = stripped.split('-');

  if (topic) {
    const topicSlug = slugify(topic);
    if (topicSlug) {
      const topicSegs = topicSlug.split('-');
      for (let i = 0; i + topicSegs.length <= segs.length; i++) {
        const matches = topicSegs.every((t, j) => segs[i + j] === t);
        if (matches) {
          return `${segs.slice(0, i + topicSegs.length).join('-')}-`;
        }
      }
    }
  }

  if (segs.length > 1) return `${segs.slice(0, -1).join('-')}-`;
  return `${id}-`;
}

/**
 * @param {string} sitePath - `further-maths/...` style
 */
function categoryFromSitePathPrefix(sitePath) {
  const n = sitePath.replace(/\\/g, '/');
  if (n.startsWith('further-maths/core-pure/')) return 'FM - Core Pure';
  if (n.startsWith('further-maths/further-mechanics/')) return 'FM - Further Mechanics';
  if (n.startsWith('tmua/')) return 'TMUA';
  return null;
}

/**
 * What the catalogue says about a section folder's packs: their category and
 * topic (the site section), the default id prefix for a new pack, and the last
 * pack row, after which a new pack's rows go.
 *
 * Only `questions`, `solutions` and `markscheme` rows filed under the folder
 * count. Folder names need not match section names, so a folder with no packs
 * has no `topic`. The id prefix comes from the questions rows alone: with a
 * pack's `-solns` row in the pool, a one-pack folder's prefix would run on into
 * that pack's own slug. The last pack row may be a mark scheme, which follows
 * its pack's solutions row, so a new pack goes after it rather than between
 * the two.
 *
 * @param {string} sitePath - e.g. `further-maths/core-pure/vectors`
 * @param {ReturnType<typeof parseResourcesEntries>} allEntries
 * @returns {{
 *   category: string;
 *   topic: string | undefined;
 *   idPrefix: string;
 *   siblingId: string | null;
 *   fromSiblings: boolean;
 * }}
 */
export function derivePathContext(sitePath, allEntries) {
  const norm = sitePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const prefix = `/tex/${norm}/`;

  const packs = allEntries.filter(
    (e) =>
      e.file.startsWith(prefix) &&
      (e.type === 'questions' || e.type === 'solutions' || e.type === 'markscheme'),
  );
  const questionIds = packs.filter((e) => e.type === 'questions').map((e) => e.id);
  const category = packs[0]?.category ?? categoryFromSitePathPrefix(norm) ?? 'unknown';
  const topic = packs[0]?.topic;
  const idPrefix =
    deriveIdPrefixFromSiblingIds(questionIds, topic, norm.split('/').pop()) ||
    fallbackIdPrefix(category, topic, norm);

  return {
    category,
    topic,
    idPrefix,
    siblingId: packs.length > 0 ? packs[packs.length - 1].id : null,
    fromSiblings: packs.length > 0,
  };
}

/**
 * @param {string} category
 * @param {string | undefined} topicTitle
 * @param {string} sitePathNorm
 */
function fallbackIdPrefix(category, topicTitle, sitePathNorm) {
  if (category === 'TMUA') return 'tmua-';
  const slug = slugify(sitePathNorm.replace(/\//g, '-'));
  if (slug) return `${slug}-`;
  return `${slugify(topicTitle ?? '')}-`;
}

/**
 * A pack's mark scheme id: its solutions id with `-ms` for `-solns`
 * (`fm-polar-integration-polar-curves-solns` gives
 * `fm-polar-integration-polar-curves-ms`). Null for an id without `-solns`.
 *
 * @param {string} solutionsId
 * @returns {string | null}
 */
export function markSchemeId(solutionsId) {
  return /-solns$/.test(solutionsId) ? solutionsId.replace(/-solns$/, '-ms') : null;
}

/**
 * Where a pack's mark scheme PDF lives, from its questions PDF: the `ms/`
 * folder beside `qbt/`, named `_QBT___MS__<stem>.pdf` for the questions file
 * `_QBT__<stem>.pdf`. Null for a path that isn't a Further Maths questions PDF.
 *
 * @param {string} questionsFile - `/tex/...` URL path
 * @returns {string | null}
 */
export function markSchemeFile(questionsFile) {
  const m = questionsFile.match(/^(\/tex\/further-maths\/[^/]+\/[^/]+)\/qbt\/_QBT__(?!_)([^/]+\.pdf)$/);
  return m ? `${m[1]}/ms/_QBT___MS__${m[2]}` : null;
}
