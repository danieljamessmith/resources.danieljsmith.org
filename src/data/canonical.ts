/**
 * A pack published in a second strand has, on each of its rows there,
 * `canonicalId`: the id of the home strand's row of the same type. Its view
 * page names the home row's view page as its canonical link and `og:url`, and
 * the sitemap leaves it out.
 *
 * These take rows as arguments, so the layout, the sitemap filter in
 * `astro.config.mjs` and the tests can all run them.
 */

/** The fields of a row these read. */
export interface CanonicalRow {
  id: string;
  canonicalId?: string;
}

/** The view page a row's own view page names as canonical: the home row's, else its own. */
export function canonicalViewPath(row: CanonicalRow): string {
  return `/view/${row.canonicalId ?? row.id}/`;
}

/** The view pages (`href`) of the rows with a `canonicalId`, which the sitemap leaves out. */
export function secondViewHrefs(rows: readonly CanonicalRow[]): string[] {
  return rows.filter((r) => r.canonicalId !== undefined).map((r) => `/view/${r.id}/`);
}
