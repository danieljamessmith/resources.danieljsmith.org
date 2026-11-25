/**
 * What the site shows: a Further Maths strand or section, or an admissions
 * test, appears only once it has at least one row in `resources.json`. A strand with none is left off the
 * home page, the header and the 404 page, and its page is `noindex` and out of
 * the sitemap; a section with none is left off its strand's page and section
 * menu. Rows are never retired, so what is shown once stays shown.
 *
 * These take the rows and strands as arguments, so pages, the sitemap filter in
 * `astro.config.mjs` and the tests can all run them.
 */

/** The fields of a row these read. */
export interface ShownRow {
  category: string;
  topic?: string;
}

/** The fields of a strand these read. */
export interface ShownStrand<T extends { topic: string } = { topic: string }> {
  category: string;
  href: string;
  topics: readonly T[];
}

/** The strands with at least one row, in catalogue order. */
export function shownStrands<S extends Pick<ShownStrand, 'category'>>(
  strands: readonly S[],
  rows: readonly ShownRow[],
): S[] {
  const categories = new Set(rows.map((r) => r.category));
  return strands.filter((s) => categories.has(s.category));
}

/** A strand's sections with at least one row of that strand, in page order. */
export function shownTopics<T extends { topic: string }>(
  strand: Pick<ShownStrand<T>, 'category' | 'topics'>,
  rows: readonly ShownRow[],
): T[] {
  const topics = new Set(rows.filter((r) => r.category === strand.category).map((r) => r.topic));
  return strand.topics.filter((t) => topics.has(t.topic));
}

/**
 * The pages (`href`) of the strands, or admissions tests, with no row, which
 * the sitemap leaves out.
 */
export function hiddenStrandHrefs(
  strands: readonly Pick<ShownStrand, 'category' | 'href'>[],
  rows: readonly ShownRow[],
): string[] {
  const shown = new Set(shownStrands(strands, rows));
  return strands.filter((s) => !shown.has(s)).map((s) => s.href);
}

/**
 * An admissions test: the category its rows carry, its name, its page and the
 * line under its name in the Admissions tests menu (its papers or modules).
 */
export interface AdmissionsTest {
  category: string;
  title: string;
  href: string;
  papers: string;
}

/**
 * The admissions tests, in the order the site lists them. Each is shown, like a
 * strand, only once it has a row: until then its page is `noindex` and out of
 * the sitemap, and the home page, the menus and the 404 page leave it out.
 */
export const ADMISSIONS_TESTS: readonly AdmissionsTest[] = [
  { category: 'TMUA', title: 'TMUA', href: '/tmua/', papers: 'Paper 1, Paper 2' },
  { category: 'ESAT', title: 'ESAT', href: '/esat/', papers: 'Maths 1, Maths 2, Physics' },
];

/** The admissions tests with at least one row, in the site's order. */
export function shownTests(rows: readonly ShownRow[], tests: readonly AdmissionsTest[] = ADMISSIONS_TESTS): AdmissionsTest[] {
  return shownStrands(tests, rows);
}

/** The pages (`href`) of the admissions tests with no row, which the sitemap leaves out. */
export function hiddenTestHrefs(rows: readonly ShownRow[], tests: readonly AdmissionsTest[] = ADMISSIONS_TESTS): string[] {
  return hiddenStrandHrefs(tests, rows);
}
