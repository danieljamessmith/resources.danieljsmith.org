/**
 * Read / merge / write `data/resources-pending.json` for deploy handoff to the splicer agent.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * @typedef {object} PendingDoc
 * @property {number} schemaVersion
 * @property {object[]} entries
 */

/**
 * @param {string} pendingPath - absolute path to `data/resources-pending.json`
 * @returns {PendingDoc}
 */
export function readPending(pendingPath) {
  if (!existsSync(pendingPath)) {
    return { schemaVersion: 1, entries: [] };
  }
  const raw = JSON.parse(readFileSync(pendingPath, 'utf8'));
  if (typeof raw.schemaVersion !== 'number') raw.schemaVersion = 1;
  if (!Array.isArray(raw.entries)) raw.entries = [];
  return raw;
}

/**
 * Atomic write: temp file in same directory then rename.
 * @param {string} pendingPath
 * @param {PendingDoc} doc
 */
export function writePendingAtomic(pendingPath, doc) {
  mkdirSync(dirname(pendingPath), { recursive: true });
  const tmp = `${pendingPath}.${randomBytes(8).toString('hex')}.tmp`;
  const body = `${JSON.stringify(doc, null, 2)}\n`;
  writeFileSync(tmp, body, 'utf8');
  renameSync(tmp, pendingPath);
}

/**
 * Insert or replace by `entry.id`, with optional confirm on replace.
 * @param {string} pendingPath
 * @param {object} entry
 * @param {{ confirmOverwrite?: (id: string) => boolean }} [opts]
 * @returns {{ ok: true, total: number } | { ok: false, reason: 'skipped' }}
 */
export function addPendingEntry(pendingPath, entry, opts = {}) {
  const doc = readPending(pendingPath);
  const idx = doc.entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    const ok = opts.confirmOverwrite ? opts.confirmOverwrite(entry.id) : false;
    if (!ok) return { ok: false, reason: 'skipped' };
    doc.entries[idx] = entry;
  } else {
    doc.entries.push(entry);
  }
  writePendingAtomic(pendingPath, doc);
  return { ok: true, total: doc.entries.length };
}
