/**
 * The mark schemes' guard: rules 25-27, beside rules 1-24 of the checker,
 * on the schemes as they are about to be committed. `check-markschemes`
 * reads the files from the git index and hands them here; everything below
 * works on paths and text, so it never sees the working tree.
 *
 * 25. The committed `.tex` is, byte for byte with LF line endings, what
 *     `render` writes now from the YAML and the pack.
 * 26. Every `ms/` YAML has its `.tex` and PDF, and every `ms/` file belongs
 *     to a pack in its section.
 * 27. Every question's stamp matches its statement and solution now
 *     (stale stamps; whether they block is the guard's setting).
 */

import { checkScheme, packModel, staleQuestions } from './markscheme.mjs';
import { renderScheme } from './markscheme-render.mjs';

const FM_ROOT = 'public/tex/further-maths/';
const SCHEME_FILE_RE = /^_QBT___MS__(.+)\.(yaml|tex|pdf)$/;

/**
 * @typedef {Object} Problem
 * @property {number} rule
 * @property {string} where
 * @property {number | null} q
 * @property {string} message
 */

/**
 * @typedef {Object} SchemeFiles
 * @property {string} yaml
 * @property {string | null} tex
 * @property {string | null} pdf
 * @property {string | null} qbt   - The pack's questions file, when it is there
 * @property {string | null} soln  - Its solutions file, when it is there
 */

/**
 * Rule 26 on a list of repo-relative paths (forward slashes), and the
 * schemes found: one per `ms/` YAML.
 *
 * @param {string[]} paths
 * @returns {{ problems: (Problem & { file: string })[], schemes: SchemeFiles[] }}
 */
export function indexSchemes(paths) {
  const present = new Set(paths);
  const problems = [];
  /** @type {Map<string, { dir: string, stem: string, yaml?: string, tex?: string, pdf?: string }>} */
  const byStem = new Map();
  const problem = (file, message) => problems.push({ file, rule: 26, where: 'file', q: null, message });

  for (const path of [...paths].sort()) {
    if (!path.startsWith(FM_ROOT)) continue;
    const segs = path.slice(FM_ROOT.length).split('/');
    const msAt = segs.indexOf('ms');
    if (msAt < 0 || msAt === segs.length - 1) continue;
    const name = segs[segs.length - 1];
    const match = SCHEME_FILE_RE.exec(name);
    if (msAt !== 2 || segs.length !== 4) {
      problem(path, 'a scheme\'s files sit directly in `<strand>/<section>/ms/`');
      continue;
    }
    if (!match) {
      problem(path, '`ms/` holds only a pack\'s scheme: `_QBT___MS__<stem>.yaml`, `.tex` and `.pdf`');
      continue;
    }
    const dir = path.slice(0, path.length - name.length - 'ms/'.length);
    const [, stem, ext] = match;
    const key = `${dir}${stem}`;
    if (!byStem.has(key)) byStem.set(key, { dir, stem });
    byStem.get(key)[ext] = path;
  }

  const schemes = [];
  for (const { dir, stem, yaml, tex, pdf } of byStem.values()) {
    const qbt = `${dir}qbt/_QBT__${stem}.tex`;
    const soln = `${dir}soln/_QBT___Solns__${stem}.tex`;
    const first = yaml ?? tex ?? pdf;
    const missingPack = [qbt, soln].filter((p) => !present.has(p));
    if (missingPack.length) {
      problem(first, `belongs to no pack in its section: ${missingPack.join(' and ')} ${missingPack.length > 1 ? 'are' : 'is'} not committed`);
    }
    const missing = [];
    if (!yaml) missing.push('.yaml');
    if (!tex) missing.push('.tex');
    if (!pdf) missing.push('.pdf');
    if (missing.length) {
      const remedy = !yaml
        ? 'a scheme\'s `.tex` and PDF come from its YAML: commit the YAML, or remove them'
        : 'commit the YAML with its rendered `.tex` (`npm run markscheme -- render`) and its compiled PDF';
      problem(first, `the scheme has no ${missing.join(' or ')} in this commit: ${remedy}`);
    }
    if (yaml) {
      schemes.push({
        yaml,
        tex: tex ?? null,
        pdf: pdf ?? null,
        qbt: present.has(qbt) ? qbt : null,
        soln: present.has(soln) ? soln : null,
      });
    }
  }
  return { problems, schemes };
}

/** The first line at which two texts differ, 1-based. */
function firstDifference(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  let line = 0;
  while (line < x.length && line < y.length && x[line] === y[line]) line++;
  return line + 1;
}

/**
 * Rules 1-24 and 25 on one scheme, and its stale stamps (rule 27).
 *
 * @param {{ yaml: string, tex: string | null, qbt: string, soln: string }} texts
 * @param {{ shared?: string, today?: Date }} [opts] - `shared`: the shared folder from the `.tex`
 * @returns {{ errors: Problem[], warnings: Problem[], stale: Problem[] }}
 */
export function guardScheme({ yaml, tex, qbt, soln }, { shared, today } = {}) {
  let pack;
  try {
    pack = packModel(qbt, soln);
  } catch (e) {
    return { errors: [{ rule: 26, where: 'file', q: null, message: `its pack can't be read: ${e.message}` }], warnings: [], stale: [] };
  }
  const result = checkScheme(yaml, pack, today ? { today } : {});
  const errors = [...result.errors];

  // Rule 25: only a scheme that checks can be rendered.
  if (tex !== null && result.errors.length === 0) {
    const rendered = renderScheme(result.scheme, pack, shared ? { shared } : {});
    const committed = tex.replace(/\r\n/g, '\n');
    if (committed !== rendered) {
      errors.push({
        rule: 25,
        where: `.tex line ${firstDifference(committed, rendered)}`,
        q: null,
        message:
          'the `.tex` is not what `render` writes from the YAML now: make the change in the YAML, then ' +
          '`npm run markscheme -- render <yaml>`, recompile and commit all three',
      });
    }
  }

  const stale = staleQuestions(result.scheme, pack).map(({ q, stamp, now }) => ({
    rule: 27,
    where: `Q${q}`,
    q,
    message:
      `stamp ${stamp}, but its statement and solution now give ${now}: look at its scheme, ` +
      `then \`npm run markscheme -- stamp <yaml> --only "${q}"\` or revise it`,
  }));
  return { errors, warnings: result.warnings, stale };
}
