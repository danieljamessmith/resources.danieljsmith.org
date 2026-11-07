/**
 * Readable text from a PDF, for scanning: the text its pages show and the
 * strings it carries (document info, bookmarks, metadata). Pure, with no
 * dependency beyond zlib; written for the PDFs pdfTeX makes, not as a
 * general PDF reader.
 *
 * Page text is rebuilt from the text-showing operators: the pieces of one
 * `TJ` array are joined, a large negative adjustment counts as a space, and
 * the ligature codes of TeX's OT1 and T1 fonts are spelt out, so a word
 * reads back whole. A line ending in a hyphen is joined to the next.
 */

import { inflateSync } from 'node:zlib';

/** OT1 (codes 11-15) and T1 (codes 27-31) ligature slots. */
const LIGATURES = new Map([
  [11, 'ff'], [12, 'fi'], [13, 'fl'], [14, 'ffi'], [15, 'ffl'],
  [27, 'ff'], [28, 'fi'], [29, 'fl'], [30, 'ffi'], [31, 'ffl'],
]);

/** A kerning adjustment more negative than this (thousandths of an em) is a space. */
const SPACE_ADJUSTMENT = -200;

/**
 * The bytes of a literal string's body (between its outer parentheses).
 * @param {string} body - latin1
 */
function literalBytes(body) {
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') {
      out.push(ch.charCodeAt(0));
      continue;
    }
    const next = body[++i];
    if (next === undefined) break;
    if (/[0-7]/.test(next)) {
      let oct = next;
      while (oct.length < 3 && /[0-7]/.test(body[i + 1] ?? '')) oct += body[++i];
      out.push(parseInt(oct, 8) & 0xff);
    } else if (next === '\r' || next === '\n') {
      if (next === '\r' && body[i + 1] === '\n') i++;
    } else {
      out.push(({ n: 10, r: 13, t: 9, b: 8, f: 12 })[next] ?? next.charCodeAt(0));
    }
  }
  return out;
}

/** @param {string} hex */
function hexBytes(hex) {
  const digits = hex.replace(/[^0-9a-fA-F]/g, '');
  const padded = digits.length % 2 ? `${digits}0` : digits;
  const out = [];
  for (let i = 0; i < padded.length; i += 2) out.push(parseInt(padded.slice(i, i + 2), 16));
  return out;
}

/** A string's bytes as text: UTF-16 with its byte-order mark, else one byte per character. */
function stringText(bytes) {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return s;
  }
  return bytes.map((b) => LIGATURES.get(b) ?? String.fromCharCode(b)).join('');
}

/**
 * The index just past the literal string opening at `start` (its `(`).
 * @param {string} s
 * @param {number} start
 */
function literalEnd(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') i++;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i + 1;
  }
  return s.length;
}

/**
 * The text-showing operators' text in a content stream.
 * @param {string} s - the stream, latin1
 * @returns {string}
 */
export function contentStreamText(s) {
  let out = '';
  /** @type {(string | number)[]} */
  let operands = [];
  /** @type {(string | number)[] | null} */
  let array = null;
  const breakLine = () => {
    if (out && !out.endsWith('\n')) out += out.endsWith('-') ? '' : '\n';
  };
  const show = (items) => {
    for (const item of items) {
      if (typeof item === 'number') {
        if (item < SPACE_ADJUSTMENT && !out.endsWith(' ') && !out.endsWith('\n')) out += ' ';
      } else {
        out += item;
      }
    }
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '%') {
      while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++;
    } else if (ch === '(') {
      const end = literalEnd(s, i);
      (array ?? operands).push(stringText(literalBytes(s.slice(i + 1, end - 1))));
      i = end;
    } else if (ch === '<' && s[i + 1] !== '<') {
      const end = s.indexOf('>', i);
      const stop = end < 0 ? s.length : end;
      (array ?? operands).push(stringText(hexBytes(s.slice(i + 1, stop))));
      i = stop + 1;
    } else if (ch === '[') {
      array = [];
      i++;
    } else if (ch === ']') {
      operands.push(array ?? []);
      array = null;
      i++;
    } else if (/[-+.\d]/.test(ch)) {
      const m = /^[-+]?(?:\d+\.?\d*|\.\d+)/.exec(s.slice(i, i + 32));
      if (m) {
        (array ?? operands).push(Number(m[0]));
        i += m[0].length;
      } else {
        i++;
      }
    } else if (/[A-Za-z'"*]/.test(ch)) {
      const m = /^[A-Za-z'"*]+/.exec(s.slice(i, i + 16));
      const op = m[0];
      i += op.length;
      if (op === 'Tj') show(operands.filter((o) => typeof o === 'string'));
      else if (op === 'TJ') show(operands.flat());
      else if (op === "'" || op === '"') {
        breakLine();
        show(operands.filter((o) => typeof o === 'string'));
      } else if (op === 'Td' || op === 'TD') {
        const dy = operands[operands.length - 1];
        if (typeof dy === 'number' && dy !== 0) breakLine();
        else if (out && !/[\s-]$/.test(out)) out += ' ';
      } else if (op === 'T*' || op === 'Tm' || op === 'ET') {
        breakLine();
      } else if (op === 'ID') {
        // Inline image data runs to `EI`; skip it.
        const end = s.indexOf('EI', i);
        i = end < 0 ? s.length : end + 2;
      }
      operands = [];
    } else {
      // Names, dictionaries and anything else: their operands don't matter here.
      if (ch === '/') {
        const m = /^\/[^\s/<>[\]()%{}]*/.exec(s.slice(i, i + 128));
        i += m[0].length;
      } else {
        i++;
      }
    }
  }
  return out.replace(/-\n/g, '-');
}

/**
 * Every string in a stretch of PDF syntax (outside content streams), one per
 * line: document info, bookmark titles, link targets.
 * @param {string} s - latin1
 */
function syntaxStrings(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '(') {
      const end = literalEnd(s, i);
      out.push(stringText(literalBytes(s.slice(i + 1, end - 1))));
      i = end;
    } else if (ch === '<' && s[i + 1] === '<') {
      i += 2;
    } else if (ch === '<') {
      const end = s.indexOf('>', i);
      if (end < 0) break;
      out.push(stringText(hexBytes(s.slice(i + 1, end))));
      i = end + 1;
    } else {
      i++;
    }
  }
  return out;
}

/**
 * The dictionary text that ends where `stream` starts at `at`.
 * @param {string} s
 * @param {number} at
 */
function dictionaryBefore(s, at) {
  const objStart = s.lastIndexOf(' obj', at);
  return s.slice(objStart < 0 ? Math.max(0, at - 2048) : objStart, at);
}

/**
 * The readable text of a PDF: page text, then every string it holds and its
 * XML metadata, one item per line.
 *
 * @param {Uint8Array} buf
 * @returns {string}
 */
export function pdfText(buf) {
  const s = Buffer.from(buf).toString('latin1');
  const parts = [];
  const syntax = [];
  let pos = 0;
  const streamRe = /stream\r?\n/g;
  let m;
  while ((m = streamRe.exec(s))) {
    if (s.slice(Math.max(0, m.index - 3), m.index) === 'end') continue;
    const dict = dictionaryBefore(s, m.index);
    const start = m.index + m[0].length;
    const length = Number(/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict)?.[1]);
    const end = Number.isFinite(length) && length > 0 ? start + length : s.indexOf('endstream', start);
    if (end < start) break;
    syntax.push(s.slice(pos, m.index));
    pos = s.indexOf('endstream', end);
    if (pos < 0) pos = end;
    streamRe.lastIndex = pos;

    // Fonts, images and cross-reference data hold no readable text.
    if (/\/Length[123]\b|\/Subtype\s*\/(?:Image|Type1C|CIDFontType0C|OpenType)|\/Type\s*\/XRef/.test(dict)) continue;
    let data = Buffer.from(s.slice(start, end), 'latin1');
    if (/\/Filter\s*\/FlateDecode/.test(dict)) {
      try {
        data = inflateSync(data);
      } catch {
        continue;
      }
    } else if (/\/Filter/.test(dict)) {
      continue;
    }
    const text = data.toString('latin1');
    if (/\/Type\s*\/Metadata/.test(dict)) parts.push(Buffer.from(text, 'latin1').toString('utf8'));
    else if (/\/Type\s*\/ObjStm/.test(dict)) parts.push(...syntaxStrings(text));
    else if (/\bBT\b/.test(text)) parts.push(contentStreamText(text));
  }
  syntax.push(s.slice(pos));
  parts.push(...syntax.flatMap(syntaxStrings));
  return parts.filter((p) => p.trim()).join('\n');
}
