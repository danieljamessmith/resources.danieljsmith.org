/**
 * Derive ids / categories / sibling anchors by scanning `src/data/resources.ts` with regex
 * (no full TypeScript parse).
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
 * @param {string} raw
 * @returns {string}
 */
function normalizeCategoryToken(raw) {
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
 * Find the index of the `]` that matches the `[` at `openIdx`, ignoring brackets
 * inside string literals and `/* … *\/` comments. Sufficient for the hand-written
 * `rawResources` array in `src/data/resources.ts` (no template strings, no regex
 * literals at top level).
 *
 * @param {string} src
 * @param {number} openIdx - index of the opening `[`
 * @returns {number} index of the matching `]`, or -1 if unbalanced
 */
function findMatchingBracket(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * @param {string} resourcesTsContent
 * @returns {Array<{ id: string; file: string; category: string; topic?: string; type?: string }>}
 */
export function parseResourcesEntries(resourcesTsContent) {
  const startRe = /const\s+rawResources\s*(?::\s*Resource\[\])?\s*=\s*\[/;
  const startM = resourcesTsContent.match(startRe);
  if (!startM || startM.index === undefined) return [];

  const openIdx = startM.index + startM[0].length - 1;
  const closeIdx = findMatchingBracket(resourcesTsContent, openIdx);
  if (closeIdx === -1) return [];

  const inner = resourcesTsContent.slice(openIdx + 1, closeIdx);
  const entries = [];
  const blockRe =
    /\{\s*id:\s*'([^']+)'[\s\S]{0,12000}?file:\s*'(\/tex\/[^']+)'[\s\S]{0,12000}?\n\s*\},?/g;
  let m;
  while ((m = blockRe.exec(inner)) !== null) {
    const block = m[0];
    const id = m[1];
    const file = m[2];
    const catRaw = block.match(/category:\s*([^,\n]+?)\s*,/);
    const topicM = block.match(/topic:\s*'([^']*)'/);
    const typeM = block.match(/type:\s*'([^']+)'/);
    const category = catRaw ? normalizeCategoryToken(catRaw[1]) : 'unknown';
    entries.push({
      id,
      file,
      category,
      topic: topicM ? topicM[1] : undefined,
      type: typeM ? typeM[1] : undefined,
    });
  }
  return entries;
}

/**
 * @param {string} [resourcesPath]
 */
export function loadResourcesEntries(resourcesPath = join(repoRoot, 'src', 'data', 'resources.ts')) {
  const content = readFileSync(resourcesPath, 'utf8');
  return parseResourcesEntries(content);
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
 * Derive an id prefix shared by sibling entries.
 * - Multiple siblings: longest common prefix, trimmed to the last `-` boundary.
 * - Single sibling: try to find the topic-slug as a contiguous run of `-`-segments
 *   inside the id, and slice through it. Falls back to dropping the trailing
 *   `-solns` and the last segment.
 *
 * @param {string[]} ids
 * @param {string} [topic] - human topic title for the sibling group
 * @returns {string}
 */
function deriveIdPrefixFromSiblingIds(ids, topic) {
  if (ids.length === 0) return '';
  if (ids.length > 1) {
    const lcp = longestCommonPrefix(ids);
    return trimToBoundary(lcp);
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
 * @param {string} sitePath
 * @param {ReturnType<typeof parseResourcesEntries>} allEntries
 * @returns {{
 *   category: string;
 *   topic: string;
 *   idPrefix: string;
 *   siblingId: string | null;
 *   fromSiblings: boolean;
 * }}
 */
export function derivePathContext(sitePath, allEntries) {
  const norm = sitePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const prefix = `/tex/${norm}/`;

  const siblings = allEntries.filter((e) => e.file.startsWith(prefix));
  const pairLike = siblings.filter(
    (e) => e.file.includes('/qbt/') || e.file.includes('/soln/'),
  );

  if (pairLike.length > 0) {
    const qOrS = pairLike.filter((e) => e.type === 'questions' || e.type === 'solutions');
    const anchorPool = qOrS.length > 0 ? qOrS : pairLike;
    const anchorLast = anchorPool[anchorPool.length - 1];
    const category = anchorPool[0].category;
    const topic =
      anchorPool[0].topic ?? deriveTopicSlugTitle(norm.split('/').pop() ?? 'topic');
    const ids = anchorPool.map((e) => e.id);
    const idPrefix =
      deriveIdPrefixFromSiblingIds(ids, topic) || fallbackIdPrefix(category, topic, norm);
    return {
      category,
      topic,
      idPrefix,
      siblingId: anchorLast.id,
      fromSiblings: true,
    };
  }

  if (siblings.length > 0) {
    const category = siblings[0].category;
    const topic = siblings[0].topic ?? deriveTopicSlugTitle(norm.split('/').pop() ?? 'topic');
    const ids = siblings.map((e) => e.id);
    const idPrefix =
      deriveIdPrefixFromSiblingIds(ids, topic) || fallbackIdPrefix(category, topic, norm);
    const siblingId = siblings[siblings.length - 1].id;
    return {
      category,
      topic,
      idPrefix,
      siblingId,
      fromSiblings: true,
    };
  }

  const leaf = norm.split('/').pop() ?? 'topic';
  const guessedCat = categoryFromSitePathPrefix(norm);
  const category = guessedCat ?? 'unknown';
  const topic = deriveTopicSlugTitle(slugify(leaf));
  const idPrefix = fallbackIdPrefix(category, topic, norm);

  return {
    category,
    topic,
    idPrefix,
    siblingId: null,
    fromSiblings: false,
  };
}

/**
 * @param {string} category
 * @param {string} topicTitle
 * @param {string} sitePathNorm
 */
function fallbackIdPrefix(category, topicTitle, sitePathNorm) {
  if (category === 'TMUA') return 'tmua-';
  const slug = slugify(sitePathNorm.replace(/\//g, '-'));
  if (slug) return `${slug}-`;
  return `${slugify(topicTitle)}-`;
}
