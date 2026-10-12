/**
 * Write a Further Maths pack's two rows into `src/data/resources.ts`.
 *
 * The file is hand-written and the scripts read it with regexes
 * (`resources-derive.mjs`), so new rows are spliced in as text, in exactly the
 * shape of the existing ones, and the result is parsed again before it is
 * kept (`verifyPackRows`).
 */

import {
  findRawResources,
  maskStringsAndComments,
  normalizeCategoryToken,
  parseResourcesEntries,
} from './resources-derive.mjs';

/** The constant each strand's rows use for `category`. */
export const CATEGORY_CONSTANTS = new Map([
  ['FM - Core Pure', 'FM_CP'],
  ['FM - Further Mechanics', 'FM_MECH'],
]);

/**
 * @typedef {Object} PackRows
 * @property {string} id         - the questions row's id; the solutions row's is `solutionsId(id)`
 * @property {string} title      - the pack title
 * @property {string} category   - e.g. `'FM - Core Pure'`
 * @property {string} topic      - the site section (`Resource.topic`)
 * @property {string} qbtFile    - `/tex/...` path of the questions PDF
 * @property {string} solnFile   - `/tex/...` path of the solutions PDF
 * @property {string[] | null} boards - exam board ids; null for all boards
 */

/** @param {string} id */
export function solutionsId(id) {
  return `${id}-solns`;
}

/** A single-quoted TypeScript string. */
export function tsSingleQuoted(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** A title: double-quoted when it holds an apostrophe, as the catalogue writes them. */
export function tsTitle(value) {
  return value.includes("'")
    ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : tsSingleQuoted(value);
}

/**
 * The questions and solutions rows, one field per line. `boards` goes on the
 * questions row only, and is left out for all boards.
 *
 * @param {PackRows} pack
 * @param {string} [indent] - indentation of each row's braces
 * @param {string} [eol]
 */
export function renderPackRows(pack, indent = '  ', eol = '\n') {
  const constant = CATEGORY_CONSTANTS.get(pack.category);
  if (!constant) throw new Error(`no category constant for '${pack.category}'`);
  const q = tsSingleQuoted;
  const field = `${indent}  `;
  const row = (fields) => [`${indent}{`, ...fields.map((f) => `${field}${f},`), `${indent}},`];
  const solns = solutionsId(pack.id);
  return [
    ...row([
      `id: ${q(pack.id)}`,
      `title: ${tsTitle(pack.title)}`,
      `description: ''`,
      `file: ${q(pack.qbtFile)}`,
      `category: ${constant}`,
      `type: 'questions'`,
      `pairId: ${q(solns)}`,
      `topic: ${q(pack.topic)}`,
      ...(pack.boards ? [`boards: [${pack.boards.map(q).join(', ')}]`] : []),
    ]),
    ...row([
      `id: ${q(solns)}`,
      `title: ${tsTitle(pack.title)}`,
      `description: 'Full worked solutions'`,
      `file: ${q(pack.solnFile)}`,
      `category: ${constant}`,
      `type: 'solutions'`,
      `pairId: ${q(pack.id)}`,
      `topic: ${q(pack.topic)}`,
    ]),
  ].join(eol);
}

/**
 * Each row of the `rawResources` array: the indices of its `{` and `}`, its
 * id and its category label.
 *
 * @param {string} source - `src/data/resources.ts`
 * @returns {{ start: number; end: number; id: string | null; category: string | null }[]}
 */
export function rowRanges(source) {
  const range = findRawResources(source);
  if (!range) throw new Error('could not find the rawResources array');
  const code = maskStringsAndComments(source);
  const rows = [];
  let depth = 0;
  let start = -1;
  for (let i = range.open + 1; i < range.close; i++) {
    const ch = code[i];
    if (ch === '{' || ch === '[' || ch === '(') {
      if (depth === 0 && ch === '{') start = i;
      depth++;
    } else if (ch === '}' || ch === ']' || ch === ')') {
      depth--;
      if (depth === 0 && ch === '}') {
        const text = source.slice(start, i + 1);
        rows.push({
          start,
          end: i,
          id: text.match(/^\{\s*id:\s*'([^']+)'/)?.[1] ?? null,
          category: (() => {
            const m = text.match(/category:\s*([^,\n]+?)\s*,/);
            return m ? normalizeCategoryToken(m[1]) : null;
          })(),
        });
      }
    }
  }
  return rows;
}

function detectEol(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > lf ? '\r\n' : '\n';
}

/**
 * `source` with the pack's two rows added.
 *
 * - With `afterId` (the section's last pack row), the rows go straight after
 *   that row.
 * - Without it, the pack is its section's first: the rows go after the last
 *   row of the pack's strand (or at the end of the array), under a
 *   `// --- <sectionComment> ---` line. Strand pages order sections by
 *   `topics.ts` and packs by their rows, so only the order within a section
 *   matters.
 *
 * @param {string} source
 * @param {PackRows} pack
 * @param {{ afterId?: string | null; sectionComment?: string }} where
 * @returns {string}
 */
export function insertPackRows(source, pack, { afterId, sectionComment }) {
  const eol = detectEol(source);
  const rows = rowRanges(source);
  let anchor;
  if (afterId) {
    anchor = rows.find((r) => r.id === afterId);
    if (!anchor) throw new Error(`no row with id '${afterId}' to insert after`);
  } else {
    if (!sectionComment) throw new Error("a section's first pack needs its section comment");
    anchor = rows.filter((r) => r.category === pack.category).pop() ?? rows[rows.length - 1];
  }

  let out = source;
  let lineEnd;
  let indent = '  ';
  if (anchor) {
    // A row followed by no comma (the array's last, written without one) gets one.
    const code = maskStringsAndComments(out);
    let next = anchor.end + 1;
    while (next < code.length && /[ \t]/.test(code[next])) next++;
    if (code[next] !== ',') out = `${out.slice(0, anchor.end + 1)},${out.slice(anchor.end + 1)}`;
    const lineStart = out.lastIndexOf('\n', anchor.start) + 1;
    indent = out.slice(lineStart, anchor.start).match(/^[ \t]*/)[0];
    const nl = out.indexOf('\n', anchor.end);
    lineEnd = nl === -1 ? out.length : out[nl - 1] === '\r' ? nl - 1 : nl;
  } else {
    lineEnd = findRawResources(out).open + 1;
  }

  const comment = afterId ? '' : `${eol}${eol}${indent}// --- ${sectionComment} ---`;
  const block = `${comment}${eol}${renderPackRows(pack, indent, eol)}`;
  return out.slice(0, lineEnd) + block + out.slice(lineEnd);
}

/**
 * What is wrong with the pack's rows in `source`, read back with the parser
 * the other scripts use: an empty list when both rows are there with the
 * expected fields.
 *
 * @param {string} source
 * @param {PackRows} pack
 * @returns {string[]}
 */
export function verifyPackRows(source, pack) {
  const entries = parseResourcesEntries(source);
  const solns = solutionsId(pack.id);
  const expected = [
    { id: pack.id, file: pack.qbtFile, type: 'questions', pairId: solns, boards: pack.boards ?? undefined },
    { id: solns, file: pack.solnFile, type: 'solutions', pairId: pack.id, boards: undefined },
  ];
  const problems = [];
  for (const want of expected) {
    const found = entries.filter((e) => e.id === want.id);
    if (found.length !== 1) {
      problems.push(`row '${want.id}' parses ${found.length} times, not once`);
      continue;
    }
    const got = found[0];
    const fields = {
      title: [got.title, pack.title],
      file: [got.file, want.file],
      category: [got.category, pack.category],
      type: [got.type, want.type],
      pairId: [got.pairId, want.pairId],
      topic: [got.topic, pack.topic],
      boards: [JSON.stringify(got.boards), JSON.stringify(want.boards)],
    };
    for (const [name, [have, wanted]] of Object.entries(fields)) {
      if (have !== wanted) {
        problems.push(`row '${want.id}' reads back ${name} ${have ?? 'unset'}, expected ${wanted ?? 'unset'}`);
      }
    }
  }
  return problems;
}
