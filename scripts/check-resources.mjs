/**
 * Read-only verifier for `src/data/resources.ts`. Catches broken catalogue
 * state that would otherwise only surface at runtime (404s in the viewer,
 * splicer agent crashes, cache-busting misses).
 *
 * Validations live in `scripts/lib/resources-check.mjs` and are pure; this
 * file only collects the inputs (parse resources.ts, walk the filesystem,
 * read the generated counts) and renders the report.
 *
 * `orphan-pdf` findings are emitted as warnings (not violations) so the
 * script can land without first cleaning up the existing backlog. Promote
 * to violation in `resources-check.mjs` once the corpus is clean.
 *
 * Usage:
 *   node scripts/check-resources.mjs
 *
 * Exits non-zero on any violation. Exits zero with warnings printed.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResourcesEntries } from './lib/resources-derive.mjs';
import { checkResources } from './lib/resources-check.mjs';
import { findPdfFiles } from './hash-assets.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const publicDir = join(repoRoot, 'public');

/**
 * Walks every file under `publicDir` and returns the set of `/tex/...`
 * style URL paths that exist on disk. Used for `missing-file` detection.
 *
 * @param {string} root
 * @returns {Set<string>}
 */
function collectPublicUrlPaths(root) {
  /** @type {Set<string>} */
  const out = new Set();
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip latexmk staging — those files are not deployed and
        // resources.ts should never reference them.
        if (entry.name === 'build' || entry.name === 'aux') continue;
        stack.push(full);
      } else {
        const rel = full.slice(root.length).replace(/\\/g, '/');
        out.add(rel);
      }
    }
  }
  return out;
}

function loadQuestionCountKeys() {
  const path = join(repoRoot, 'src', 'data', 'questionCounts.generated.ts');
  let body;
  try {
    body = readFileSync(path, 'utf-8');
  } catch {
    return new Set();
  }
  /** @type {Set<string>} */
  const keys = new Set();
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*'([^']+)':\s*\d+,/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function loadDeployedPdfs() {
  /** @type {Set<string>} */
  const out = new Set();
  for (const abs of findPdfFiles(join(publicDir, 'tex'))) {
    out.add(abs.slice(publicDir.length).replace(/\\/g, '/'));
  }
  return out;
}

function main() {
  const resourcesPath = join(repoRoot, 'src', 'data', 'resources.ts');
  const entries = parseResourcesEntries(readFileSync(resourcesPath, 'utf-8'));
  if (entries.length === 0) {
    console.error(`check-resources: parsed 0 entries from ${relative(repoRoot, resourcesPath)} — parser may have lost sync.`);
    process.exit(1);
  }

  const diskFiles = collectPublicUrlPaths(publicDir);
  const deployedPdfs = loadDeployedPdfs();
  const questionCountKeys = loadQuestionCountKeys();

  const { violations, warnings } = checkResources({
    entries,
    diskFiles,
    deployedPdfs,
    questionCountKeys,
  });

  // Group by id for a more scannable report; ungrouped findings (orphan-pdf)
  // print in their own section.
  const byId = new Map();
  /** @type {import('./lib/resources-check.mjs').Finding[]} */
  const noId = [];
  for (const v of violations) {
    if (v.id) {
      if (!byId.has(v.id)) byId.set(v.id, []);
      byId.get(v.id).push(v);
    } else {
      noId.push(v);
    }
  }

  for (const [id, vs] of byId) {
    console.error(`✗ ${id}`);
    for (const v of vs) console.error(`    [${v.kind}] ${v.message}`);
  }
  for (const v of noId) {
    console.error(`✗ [${v.kind}] ${v.message}`);
  }
  for (const w of warnings) {
    console.warn(`  (warn ${w.kind}) ${w.message}`);
  }

  const summary =
    `check-resources: ${entries.length} entries, ` +
    `${violations.length} violation(s), ${warnings.length} warning(s)`;
  if (violations.length > 0) {
    console.error(`\n${summary}`);
    process.exit(1);
  }
  console.log(summary);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
