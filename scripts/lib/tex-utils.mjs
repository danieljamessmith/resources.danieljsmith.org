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
