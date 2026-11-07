import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { contentStreamText, pdfText } from './pdf-text.mjs';

/**
 * A small PDF in pdfTeX's shape: a compressed page content stream, a font
 * file that must be skipped, an object stream holding a bookmark title, and
 * an uncompressed info dictionary.
 */
function samplePdf({ content, bookmark = '(Question 1)', info = '/Producer (pdfTeX-1.40.29) /Title (A Title)' }) {
  const stream = (dict, data, compress = true) => {
    const bytes = compress ? deflateSync(Buffer.from(data, 'latin1')) : Buffer.from(data, 'latin1');
    return Buffer.concat([
      Buffer.from(`<<\n${dict}\n/Length ${bytes.length}${compress ? '\n/Filter /FlateDecode' : ''}\n>>\nstream\n`, 'latin1'),
      bytes,
      Buffer.from('\nendstream\nendobj\n', 'latin1'),
    ]);
  };
  return Buffer.concat([
    Buffer.from('%PDF-1.5\n%\xd0\xd4\xc5\xd8\n4 0 obj\n', 'latin1'),
    stream('', content),
    Buffer.from('5 0 obj\n', 'latin1'),
    stream('/Length1 1000 /Length2 2000 /Length3 0', '(a font program mentioning hiddenterm)'),
    Buffer.from('6 0 obj\n', 'latin1'),
    stream('/Type /ObjStm /N 1 /First 4', `7 0 << /Title ${bookmark} /Parent 8 0 R >>`),
    Buffer.from(`9 0 obj\n<<\n${info}\n>>\nendobj\ntrailer\n<< /Info 9 0 R >>\n%%EOF\n`, 'latin1'),
  ]);
}

describe('contentStreamText', () => {
  it('joins the pieces of a TJ array, with large negative adjustments as spaces', () => {
    expect(contentStreamText('BT /F1 9.96 Tf 57 802 Td [(In)28(tegration)-333(of)-334(P)28(olar)]TJ ET')).toBe(
      'Integration of Polar\n',
    );
  });

  it('spells out ligatures, escapes and octal codes', () => {
    expect(contentStreamText('BT [(\\014nd)-333(the)-333(\\034rst)]TJ 40 0 Td (a\\(b\\)\\\\c) Tj ET')).toBe(
      'find the first a(b)\\c\n',
    );
  });

  it('breaks lines on a vertical move and joins a hyphenated line', () => {
    expect(contentStreamText('BT [(one)]TJ 0 -12 Td [(two)]TJ 0 -12 Td [(hyphen-)]TJ 0 -12 Td [(ated)]TJ ET')).toBe(
      'one\ntwo\nhyphen-ated\n',
    );
  });

  it('reads hex strings and ignores graphics', () => {
    expect(contentStreamText('q 1 0 0 1 2 3 cm 0 0 m 5 5 l S Q BT <48656c6c6f> Tj ET')).toBe('Hello\n');
  });
});

describe('pdfText', () => {
  it('reads page text, bookmarks and the info dictionary, and skips font programs', () => {
    const text = pdfText(samplePdf({ content: 'BT [(Some)-333(page)-333(words)]TJ ET' }));
    expect(text).toContain('Some page words');
    expect(text).toContain('Question 1');
    expect(text).toContain('pdfTeX-1.40.29');
    expect(text).toContain('A Title');
    expect(text).not.toContain('hiddenterm');
  });

  it('decodes UTF-16 strings', () => {
    const text = pdfText(samplePdf({ content: 'BT ET', bookmark: '<FEFF0051002D0031>' }));
    expect(text).toContain('Q-1');
  });
});
