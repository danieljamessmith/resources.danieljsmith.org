/**
 * Read-only integrity check: every topic that has any QBT/soln pack asset
 * must have all four of { qbt.tex, qbt.pdf, soln.tex, soln.pdf }. A mark
 * scheme in the `ms/` folder needs its pack beside it, and once rendered its
 * .yaml, .tex and .pdf together. Also flags tracked files under public/tex
 * that are missing from the working tree, except index-only `ms/` files.
 *
 * Packs are read from the working tree, schemes from the git index, so an
 * unstaged draft scheme (a YAML and its draft .tex, no PDF) never blocks a
 * commit. `check-markschemes` checks the committed schemes in full.
 *
 * Usage: node scripts/check-pairs.mjs
 */

import { readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { normalizePath } from './lib/tex-utils.mjs';
import { checkPairPresence } from './lib/pair-presence.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const texRoot = join(repoRoot, 'public', 'tex');

const QBT_PACK = /^_QBT__(?!_Solns__)(?!_MS__).+\.(tex|pdf)$/;
const SOLN_PACK = /^_QBT___Solns__.+\.(tex|pdf)$/;
const MS_PACK = /^_QBT___MS__.+\.(yaml|tex|pdf)$/;

/**
 * @param {string} base
 * @param {'qbt' | 'soln' | 'ms'} kind
 * @returns {string | null}
 */
function topicNameFromBasename(base, kind) {
  if (kind === 'qbt') {
    if (!QBT_PACK.test(base)) return null;
    return base.replace(/^_QBT__/, '').replace(/\.(tex|pdf)$/, '');
  }
  if (kind === 'ms') {
    if (!MS_PACK.test(base)) return null;
    return base.replace(/^_QBT___MS__/, '').replace(/\.(yaml|tex|pdf)$/, '');
  }
  if (!SOLN_PACK.test(base)) return null;
  return base.replace(/^_QBT___Solns__/, '').replace(/\.(tex|pdf)$/, '');
}

/** @type {Map<string, import('./lib/pair-presence.mjs').PackTopicSlot>} */
const byTopic = new Map();

/**
 * @param {string} absFile
 * @param {string} repoRoot
 * @returns {void}
 */
function ingestPackFile(absFile, repoRoot) {
  const norm = normalizePath(absFile);
  if (norm.includes('/notes/')) return;

  const segs = norm.split('/');
  // The pack's own folder is the file's parent.
  const kindIdx = segs.length - 2;
  if (kindIdx < 1 || !['qbt', 'soln', 'ms'].includes(segs[kindIdx])) return;

  const folderKind = /** @type {'qbt' | 'soln' | 'ms'} */ (segs[kindIdx]);
  const topicDirAbs = segs.slice(0, kindIdx).join('/');
  const relTopicDir = normalizePath(relative(repoRoot, topicDirAbs));
  const base = segs[segs.length - 1];

  const topicName = topicNameFromBasename(base, folderKind);
  if (topicName == null) return;

  const key = `${relTopicDir}::${topicName}`;
  let slot = byTopic.get(key);
  if (!slot) {
    slot = {
      topicKey: key,
      relTopicDir,
      topicName,
      qbtTex: false,
      qbtPdf: false,
      solnTex: false,
      solnPdf: false,
    };
    byTopic.set(key, slot);
  }

  const ext = base.endsWith('.tex') ? 'tex' : base.endsWith('.yaml') ? 'yaml' : 'pdf';
  if (folderKind === 'ms') {
    if (ext === 'yaml') slot.msYaml = true;
    else if (ext === 'tex') slot.msTex = true;
    else slot.msPdf = true;
  } else if (folderKind === 'qbt') {
    if (ext === 'tex') slot.qbtTex = true;
    else slot.qbtPdf = true;
  } else {
    if (ext === 'tex') slot.solnTex = true;
    else slot.solnPdf = true;
  }
}

/**
 * @param {string} dir
 */
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'build' || entry.name === 'aux' || entry.name === 'ms') continue;
      walk(full);
    } else {
      const rel = normalizePath(relative(repoRoot, full));
      if (!rel.startsWith('public/tex/')) continue;
      if (!rel.includes('/qbt/') && !rel.includes('/soln/')) continue;
      if (!/\.(tex|pdf|yaml)$/.test(entry.name)) continue;
      ingestPackFile(full, repoRoot);
    }
  }
}

/** Mark scheme files as they are about to be committed. */
function ingestIndexedSchemes() {
  let buf;
  try {
    buf = execSync('git -c core.quotepath=false ls-files -z --cached -- public/tex/', {
      cwd: repoRoot,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    console.error('check-pairs: git ls-files failed:', e.message || e);
    process.exit(1);
  }
  for (const rel of buf.toString('utf8').split('\0')) {
    if (!rel || !rel.includes('/ms/') || !/\.(tex|pdf|yaml)$/.test(rel)) continue;
    ingestPackFile(join(repoRoot, rel), repoRoot);
  }
}

function getTrackedMissing() {
  try {
    const buf = execSync('git -c core.quotepath=false ls-files -z --deleted -- public/tex/', {
      cwd: repoRoot,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (!buf.length) return [];
    return buf
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .map((p) => normalizePath(p))
      .filter((p) => !p.includes('/ms/'));
  } catch (e) {
    console.error('check-pairs: git ls-files failed:', e.message || e);
    process.exit(1);
  }
}

function main() {
  walk(texRoot);
  ingestIndexedSchemes();

  const slots = Array.from(byTopic.values()).sort((a, b) => a.topicKey.localeCompare(b.topicKey));
  const trackedMissing = getTrackedMissing();

  const { violations } = checkPairPresence(slots, trackedMissing);

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`✗ [${v.kind}] ${v.message}`);
    }
    console.error(
      `\ncheck-pairs: ${violations.length} violation(s) — fix incomplete quartets or restore deleted files.`,
    );
    process.exit(1);
  }

  const tm =
    trackedMissing.length === 0
      ? 'no tracked files missing from disk'
      : `${trackedMissing.length} tracked file(s) missing from disk (unexpected)`;
  console.log(`check-pairs: ${slots.length} topic quartet(s) complete; ${tm}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
