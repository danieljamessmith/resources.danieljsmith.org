import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readPending, writePendingAtomic, addPendingEntry } from './staging.mjs';

describe('staging', () => {
  let dir;
  let path;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'staging-test-'));
    path = join(dir, 'resources-pending.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('fresh-write creates schemaVersion 1', () => {
    writePendingAtomic(path, { schemaVersion: 1, entries: [{ id: 'a' }] });
    const doc = readPending(path);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.entries).toEqual([{ id: 'a' }]);
  });

  it('appends entries', () => {
    addPendingEntry(path, { id: 'one', x: 1 }, {});
    addPendingEntry(path, { id: 'two', x: 2 }, {});
    const doc = readPending(path);
    expect(doc.entries).toHaveLength(2);
  });

  it('dedupes by id with confirm', () => {
    addPendingEntry(path, { id: 'dup', v: 1 }, {});
    const r = addPendingEntry(path, { id: 'dup', v: 2 }, {
      confirmOverwrite: () => true,
    });
    expect(r.ok).toBe(true);
    expect(readPending(path).entries[0].v).toBe(2);
  });

  it('skips overwrite when confirm returns false', () => {
    addPendingEntry(path, { id: 'dup', v: 1 }, {});
    const r = addPendingEntry(path, { id: 'dup', v: 2 }, {
      confirmOverwrite: () => false,
    });
    expect(r.ok).toBe(false);
    expect(readPending(path).entries[0].v).toBe(1);
  });

  it('atomic write uses a temp file then target', () => {
    writePendingAtomic(path, { schemaVersion: 1, entries: [] });
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('schemaVersion');
  });
});
