/** The tuition site, whose contact form takes the enquiries about resources. */
const TUITION_SITE = import.meta.env.PUBLIC_TUITION_SITE ?? 'https://tuition.danieljsmith.org';

/**
 * The contact form, opened on a resources enquiry about one topic.
 *
 * `topic` is the form's own name for it ('tmua'); a name the form doesn't
 * know still opens the resources enquiry, with no topic chosen.
 */
export function resourcesEnquiryHref(topic: string, site: string = TUITION_SITE): string {
  const query = new URLSearchParams({ enquiry: 'resources', topic });
  return `${site.replace(/\/+$/, '')}/contact/?${query}`;
}
