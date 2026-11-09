import { describe, expect, it } from 'vitest';
import { canonicalViewPath, secondViewHrefs } from './canonical';

/** A pack in its home strand, and the same pack published in a second strand. */
const ROWS = [
  { id: 'cp-groups' },
  { id: 'cp-groups-solns' },
  { id: 'fm-ap-groups', canonicalId: 'cp-groups' },
  { id: 'fm-ap-groups-solns', canonicalId: 'cp-groups-solns' },
];

describe('canonicalViewPath', () => {
  it("is a row's own view page when it has no canonicalId", () => {
    expect(canonicalViewPath(ROWS[0])).toBe('/view/cp-groups/');
  });

  it("is the home row's view page when it has one", () => {
    expect(canonicalViewPath(ROWS[2])).toBe('/view/cp-groups/');
    expect(canonicalViewPath(ROWS[3])).toBe('/view/cp-groups-solns/');
  });
});

describe('secondViewHrefs', () => {
  it('names the view pages of the rows with a canonicalId, which the sitemap leaves out', () => {
    expect(secondViewHrefs(ROWS)).toEqual(['/view/fm-ap-groups/', '/view/fm-ap-groups-solns/']);
  });

  it('names none when no row has one', () => {
    expect(secondViewHrefs(ROWS.slice(0, 2))).toEqual([]);
  });
});
