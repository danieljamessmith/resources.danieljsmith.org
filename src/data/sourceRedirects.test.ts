import { describe, expect, it } from 'vitest';
import sourceIds from './source-redirects.json';
import rows from './resources.json';

/**
 * The old `/source/<id>/` addresses, each now a redirect to `/view/<id>/`.
 * The list is fixed: it holds every id that once had a source page, so no
 * address that worked before stops working.
 */
describe('the source redirects', () => {
  it('list each id once, in order', () => {
    expect(sourceIds).toEqual([...new Set(sourceIds)].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('each send the reader to a viewer page that exists', () => {
    const ids = new Set((rows as { id: string }[]).map((r) => r.id));
    expect(sourceIds.filter((id) => !ids.has(id))).toEqual([]);
  });
});
