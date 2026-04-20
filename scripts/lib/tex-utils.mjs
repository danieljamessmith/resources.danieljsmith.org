/**
 * Shared utilities for scripts that operate on the LaTeX source tree.
 */

import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Normalises path separators to forward slashes. */
export function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Returns true if a repo-relative path is a trackable QBT/soln .tex file
 * (i.e. not inside a notes/ directory and not a build artefact).
 * @param {string} relFromRepo
 */
export function shouldProcessTexFile(relFromRepo) {
  const p = normalizePath(relFromRepo).toLowerCase();
  if (!p.endsWith('.tex')) return false;
  if (p.includes('/notes/')) return false;
  return p.includes('/qbt/') || p.includes('/soln/');
}

/**
 * Recursively collects .tex files under `dir`, optionally filtered by a
 * predicate that receives the repo-relative path.
 * @param {string} dir - Absolute path to start from.
 * @param {string} repoRoot - Absolute path to the repo root (used to compute relative paths).
 * @param {(relFromRepo: string) => boolean} [filter] - Defaults to `shouldProcessTexFile`.
 * @param {string[]} [acc]
 */
export function walkTexFiles(dir, repoRoot, filter = shouldProcessTexFile, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTexFiles(full, repoRoot, filter, acc);
    } else if (entry.isFile() && entry.name.endsWith('.tex')) {
      const rel = relative(repoRoot, full);
      if (filter(rel)) acc.push(full);
    }
  }
  return acc;
}

/**
 * @typedef {Object} PackPair
 * @property {string} topicDir   - Absolute path to the `<topic>/` directory
 *                                 that contains both `qbt/` and `soln/`.
 * @property {string} qbtPath    - Absolute path to `_QBT__<Topic>.tex`.
 * @property {string} solnPath   - Absolute path to `_QBT___Solns__<Topic>.tex`.
 * @property {string} topicName  - The shared `<Topic>` segment.
 */

/**
 * @typedef {Object} PackPairsResult
 * @property {PackPair[]} pairs           - Topics with both qbt and soln.
 * @property {{ topicDir: string; kind: 'qbt' | 'soln'; path: string }[]} unpaired
 *                                        - Files that lack a sibling.
 */

/**
 * Discovers `(qbt, soln)` pack pairs under `searchRoot` by topic directory.
 *
 * Pairing rule: for each `<topic>/qbt/_QBT__<Topic>.tex`, look for the
 * matching `<topic>/soln/_QBT___Solns__<Topic>.tex`. Topic names must match
 * after stripping the `_QBT__` / `_QBT___Solns__` filename prefix.
 *
 * Notes:
 *  - Files outside `qbt/` or `soln/` (e.g. notes/) are ignored.
 *  - A `qbt/` file with no matching `soln/` file (or vice versa) is reported
 *    in `unpaired` rather than silently dropped.
 *
 * @param {string} searchRoot - Absolute path to start from.
 * @param {string} repoRoot   - Absolute path to the repo root.
 * @returns {PackPairsResult}
 */
export function findPackPairs(searchRoot, repoRoot) {
  const allTex = walkTexFiles(searchRoot, repoRoot, shouldProcessTexFile);

  /** @type {Map<string, { qbt?: string; soln?: string }>} */
  const byTopic = new Map();

  for (const abs of allTex) {
    const norm = normalizePath(abs);
    const segs = norm.split('/');
    const kindIdx = segs.lastIndexOf('qbt') >= 0 ? segs.lastIndexOf('qbt') : segs.lastIndexOf('soln');
    if (kindIdx < 1) continue;
    const kind = segs[kindIdx] === 'qbt' ? 'qbt' : 'soln';
    const topicDir = segs.slice(0, kindIdx).join('/');
    const base = segs[segs.length - 1];
    const topicName =
      kind === 'qbt'
        ? base.replace(/^_QBT__(?!_Solns__)/, '').replace(/\.tex$/, '')
        : base.replace(/^_QBT___Solns__/, '').replace(/\.tex$/, '');
    const key = `${topicDir}::${topicName}`;
    const slot = byTopic.get(key) ?? {};
    slot[kind] = abs;
    byTopic.set(key, slot);
  }

  /** @type {PackPair[]} */
  const pairs = [];
  /** @type {{ topicDir: string; kind: 'qbt' | 'soln'; path: string }[]} */
  const unpaired = [];

  for (const [key, slot] of byTopic) {
    const [topicDir, topicName] = key.split('::');
    if (slot.qbt && slot.soln) {
      pairs.push({ topicDir, qbtPath: slot.qbt, solnPath: slot.soln, topicName });
    } else if (slot.qbt) {
      unpaired.push({ topicDir, kind: 'qbt', path: slot.qbt });
    } else if (slot.soln) {
      unpaired.push({ topicDir, kind: 'soln', path: slot.soln });
    }
  }

  pairs.sort((a, b) => a.qbtPath.localeCompare(b.qbtPath));
  unpaired.sort((a, b) => a.path.localeCompare(b.path));
  return { pairs, unpaired };
}

/**
 * Returns the 0-based indices of the lines containing \begin{document} and
 * \end{document}.  Returns -1 for either if not found.
 * @param {string[]} lines
 * @returns {{ beginIdx: number; endIdx: number }}
 */
export function findDocBoundaries(lines) {
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
