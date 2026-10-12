/**
 * Shallow tree banner + drill-down picker for a Further Maths section folder
 * (`<strand folder>/<section folder>` under `public/tex/further-maths/`).
 */

import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Depth of a section folder below the picker's root: strand, then section. */
export const SECTION_DEPTH = 2;

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
 * `..` is handled by the caller (pickSitePath), not here. `use` confirms only
 * a section folder, and no folder is created: a new section is a separate
 * site change.
 *
 * @param {string[]} entries - sorted directory names under the current folder
 * @param {string} rawInput
 * @param {{ atRoot: boolean, atSection?: boolean }} opts
 *   - `atSection`: the current folder is a section folder
 * @returns {{ kind: 'descend', name: string } | { kind: 'use' } | { kind: 'invalid', message: string }}
 */
export function pickerStep(entries, rawInput, opts) {
  const input = rawInput.trim();
  if (!input) {
    return { kind: 'invalid', message: 'Enter a number, a folder name, or "use" to confirm this section folder.' };
  }

  const lower = input.toLowerCase();
  if (lower === 'use' || input === '.') {
    if (opts.atRoot) {
      return { kind: 'invalid', message: 'Pick a subfolder first — you cannot import to the root.' };
    }
    if (!opts.atSection) {
      return { kind: 'invalid', message: 'Pick a section folder: a strand folder, then one of its sections.' };
    }
    return { kind: 'use' };
  }

  if (/^new\s/i.test(input)) {
    return {
      kind: 'invalid',
      message: 'Import only into an existing section folder. Adding a section is a separate site change.',
    };
  }

  if (opts.atSection) {
    return { kind: 'invalid', message: 'This is a section folder: "use" to confirm it, or .. to go up.' };
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
    message: `Unknown folder "${input}". Try a listed name, its number, or "use".`,
  };
}

/**
 * Interactive drill-down until the user confirms a section folder.
 * @param {import('node:readline/promises').Interface} rl
 * @param {string} root - absolute path to `public/tex/further-maths`
 * @returns {Promise<string>} `<strand folder>/<section folder>`
 */
export async function pickSitePath(rl, root) {
  let current = root;
  const parts = [];

  for (;;) {
    const atRoot = parts.length === 0;
    const atSection = parts.length === SECTION_DEPTH;
    let childNames = [];
    if (!atSection) {
      try {
        childNames = readdirSync(current, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort((a, b) => a.localeCompare(b));
      } catch {
        console.error(`Cannot read directory: ${current}`);
        throw new Error('site path picker: directory read failed');
      }
    }

    const rel = parts.join('/') || '(further-maths)';
    console.log(`\nCurrent: ${rel}`);
    if (atSection) {
      console.log('  (a section folder — type "use" to confirm it)');
    } else if (childNames.length === 0) {
      console.log('  (no subfolders)');
    } else {
      childNames.forEach((name, i) => {
        console.log(`  ${i + 1}. ${name}/`);
      });
    }
    console.log('  Commands: <n> or <folder> to go down, .. to go up, "use" or . to confirm a section folder');

    const line = await rl.question('> ');
    const trimmed = line.trim();
    if (trimmed === '..') {
      if (atRoot) {
        console.log('  Already at the top.');
        continue;
      }
      parts.pop();
      current = parts.length === 0 ? root : join(root, ...parts);
      continue;
    }

    const step = pickerStep(childNames, trimmed, { atRoot, atSection });
    switch (step.kind) {
      case 'invalid':
        console.error(`  ${step.message}`);
        break;
      case 'use':
        return parts.join('/');
      case 'descend':
        parts.push(step.name);
        current = join(current, step.name);
        break;
      default:
        break;
    }
  }
}
