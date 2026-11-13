import { describe, expect, it } from 'vitest';
import { resourcesEnquiryHref } from './enquiry';

describe('resourcesEnquiryHref', () => {
  it('opens the contact form on a resources enquiry about the topic', () => {
    const url = new URL(resourcesEnquiryHref('tmua', 'https://tuition.example'));
    expect(url.origin + url.pathname).toBe('https://tuition.example/contact/');
    expect(Object.fromEntries(url.searchParams)).toEqual({ enquiry: 'resources', topic: 'tmua' });
  });

  it('keeps one slash between the site and the path', () => {
    expect(resourcesEnquiryHref('esat', 'http://localhost:4322/')).toBe(
      'http://localhost:4322/contact/?enquiry=resources&topic=esat',
    );
  });

  it('escapes a topic that is not a plain word', () => {
    expect(new URL(resourcesEnquiryHref('a&b=c', 'https://tuition.example')).searchParams.get('topic')).toBe('a&b=c');
  });
});
