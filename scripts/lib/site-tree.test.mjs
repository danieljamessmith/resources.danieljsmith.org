import { describe, it, expect } from 'vitest';
import { pickerStep } from './site-tree.mjs';

describe('pickerStep', () => {
  const entries = ['further-maths', 'tmua'];

  it('descends by number', () => {
    expect(pickerStep(entries, '1', { atRoot: true })).toEqual({
      kind: 'descend',
      name: 'further-maths',
    });
  });

  it('descends by folder name', () => {
    expect(pickerStep(entries, 'tmua', { atRoot: true })).toEqual({
      kind: 'descend',
      name: 'tmua',
    });
  });

  it('rejects use at root', () => {
    const r = pickerStep(entries, 'use', { atRoot: true });
    expect(r.kind).toBe('invalid');
    expect(r.message).toMatch(/root/i);
  });

  it('allows use below root', () => {
    expect(pickerStep(entries, 'use', { atRoot: false })).toEqual({ kind: 'use' });
  });

  it('creates new kebab folder', () => {
    expect(pickerStep(entries, 'new my-topic', { atRoot: true })).toEqual({
      kind: 'new',
      name: 'my-topic',
    });
  });

  it('rejects invalid new folder names', () => {
    const r = pickerStep(entries, 'new My_Topic', { atRoot: true });
    expect(r.kind).toBe('invalid');
  });

  it('returns invalid for unknown input', () => {
    const r = pickerStep(entries, 'nope', { atRoot: true });
    expect(r.kind).toBe('invalid');
  });
});
