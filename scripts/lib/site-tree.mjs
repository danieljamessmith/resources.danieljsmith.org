/**
 * Shallow tree banner + drill-down picker helpers for `public/tex/` site paths.
 */

import { mkdirSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const KEBAB = /^[a-z0-9-]+$/;

/** @param {string} name */
export function isKebabCaseDir(name) {
  return KEBAB.test(name);
}

/**
 * ASCII tree of directories under `root` up to `maxDepth` levels (root counts as depth 0).
 * @param {string} root
 * @param {number} [maxDepth]
 * @returns {string}
 */
export function listTreeShallow(root, maxDepth = 3) {
  const lines = [];

  function walk(current, depth, prefix) {
    if (depth >= maxDepth) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < dirs.length; i++) {
      const name = dirs[i];
      const isLast = i === dirs.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      lines.push(`${prefix}${connector}${name}/`);
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      walk(join(current, name), depth + 1, nextPrefix);
    }
  }

  const label = relative(process.cwd(), root).replace(/\\/g, '/') || root.replace(/\\/g, '/');
  lines.push(`${label}/`);
  walk(root, 0, '');
  return lines.join('\n');
}

/**
 * Pure mapping from (child directory names, user input) to a picker decision.
 * `..` is handled by the caller (pickSitePath), not here.
 *
 * @param {string[]} entries - sorted directory names under the current folder
 * @param {string} rawInput
 * @param {{ atRoot: boolean }} opts
 * @returns {{ kind: 'descend', name: string } | { kind: 'use' } | { kind: 'new', name: string } | { kind: 'invalid', message: string }}
 */
export function pickerStep(entries, rawInput, opts) {
  const input = rawInput.trim();
  if (!input) {
    return { kind: 'invalid', message: 'Enter a number, folder name, "use" to confirm this folder, or "new <name>" for a new folder.' };
  }

  const lower = input.toLowerCase();
  if (lower === 'use' || input === '.') {
    if (opts.atRoot) {
      return { kind: 'invalid', message: 'Pick a subfolder first — you cannot deploy to the tex root.' };
    }
    return { kind: 'use' };
  }

  const newMatch = input.match(/^new\s+(.+)$/i);
  if (newMatch) {
    const name = newMatch[1].trim();
    if (!name) {
      return { kind: 'invalid', message: 'Usage: new <folder-name> (lowercase kebab-case, e.g. new vector-methods).' };
    }
    if (!isKebabCaseDir(name)) {
      return {
        kind: 'invalid',
        message: 'New folder names must be lowercase kebab-case (letters, digits, hyphens only).',
      };
    }
    if (entries.includes(name)) {
      return { kind: 'invalid', message: `A folder named "${name}" already exists here — pick a different name or descend into it.` };
    }
    return { kind: 'new', name };
  }

  if (/^\d+$/.test(input)) {
    const n = parseInt(input, 10);
    if (n < 1 || n > entries.length) {
      return { kind: 'invalid', message: `Pick a number between 1 and ${entries.length}, or use a folder name.` };
    }
    return { kind: 'descend', name: entries[n - 1] };
  }

  if (entries.includes(input)) {
    return { kind: 'descend', name: input };
  }

  return {
    kind: 'invalid',
    message: `Unknown folder "${input}". Try a listed name, its number, "use", or "new <kebab-name>".`,
  };
}

/**
 * Interactive drill-down until the user confirms a leaf site path (repo-relative: `further-maths/...`).
 * @param {import('node:readline/promises').Interface} rl
 * @param {string} texRoot - absolute path to `public/tex`
 * @returns {Promise<string>} site path using `/` separators, no leading slash
 */
export async function pickSitePath(rl, texRoot) {
  let current = texRoot;
  const parts = [];

  for (;;) {
    let childNames;
    try {
      childNames = readdirSync(current, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
    } catch {
      console.error(`Cannot read directory: ${current}`);
      throw new Error('site path picker: directory read failed');
    }

    const atRoot = current === texRoot;
    const rel = relative(texRoot, current).replace(/\\/g, '/') || '(tex root)';

    console.log(`\nCurrent: ${rel}`);
    if (childNames.length === 0) {
      console.log('  (no subfolders — type "use" to confirm this path)');
    } else {
      childNames.forEach((name, i) => {
        console.log(`  ${i + 1}. ${name}/`);
      });
    }
    console.log('  Commands: <n> or <folder> to go down, .. to go up, "use" or . to confirm, new <kebab-name> to create a folder');
    if (atRoot) {
      console.log('  (you must pick a subfolder — cannot "use" at the tex root)');
    }

    const line = await rl.question('> ');
    const trimmed = line.trim();
    if (trimmed === '..') {
      if (atRoot) {
        console.log('  Already at tex root.');
        continue;
      }
      parts.pop();
      current = parts.length === 0 ? texRoot : join(texRoot, ...parts);
      continue;
    }

    const step = pickerStep(childNames, trimmed, { atRoot });
    switch (step.kind) {
      case 'invalid':
        console.error(`  ${step.message}`);
        break;
      case 'use':
        if (parts.length === 0) {
          console.error('  Cannot use tex root.');
          break;
        }
        return parts.join('/');
      case 'new': {
        const created = join(current, step.name);
        mkdirSync(created, { recursive: true });
        parts.push(step.name);
        current = created;
        break;
      }
      case 'descend': {
        parts.push(step.name);
        current = join(current, step.name);
        break;
      }
      default:
        break;
    }
  }
}
