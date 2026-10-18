import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, parseArgs } from './markscheme.mjs';
import { emitScheme, readPack } from './lib/markscheme.mjs';

const HEAD = String.raw`\documentclass[leqno]{article}
\input{../../../../_shared/pack_preamble.tex}
\djsQbtHeader{Scratch Pack}
\djsSitePath{Core Pure}{Scratch}
\djsLastUpdated{1 October 2026}
\begin{document}
\djsFrontMatter
\begin{enumerate}[label=\textbf{\arabic*.}]

`;
const FOOT = '\\end{enumerate}\n\\end{document}\n';
const QUESTIONS = [
  ['Find \\(x\\). \\marks{2}', '\\(x = 1\\).'],
  [
    '\\begin{enumerate}[label=\\textbf{(\\alph*)}]\n  \\item Find \\(y\\). \\marks{1}\n  \\item Find \\(z\\). \\marks{2}\n\\end{enumerate}',
    '\\(y = 2\\), \\(z = 3\\).',
  ],
];

/** Writes the pack's two files, its questions in `order`. */
function setPack(order = [0, 1], edit = (s) => s) {
  const block = (i, n, withSolution) =>
    `% ---- Question ${n} ----\n\\questionitem\n${edit(QUESTIONS[i][0])}\n\n` +
    (withSolution ? `\\vspace*{10pt}\n\n\\begin{djsSolution}\n${QUESTIONS[i][1]}\n\\end{djsSolution}\n\n` : '') +
    '\\newpage\n\n';
  const body = (withSolution) => order.map((i, k) => block(i, k + 1, withSolution)).join('');
  writeFileSync(join(section, 'qbt', '_QBT__Scratch_Pack.tex'), HEAD + body(false) + FOOT);
  writeFileSync(
    join(section, 'soln', '_QBT___Solns__Scratch_Pack.tex'),
    HEAD.replace('djsQbtHeader', 'djsSolnHeader') + body(true) + FOOT,
  );
}

let dir;
let section;
let out;
let err;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'markscheme-'));
  section = join(dir, 'further-maths', 'core-pure', 'scratch');
  for (const sub of ['qbt', 'soln', 'ms']) mkdirSync(join(section, sub), { recursive: true });
  setPack();
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => out.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a) => err.push(a.join(' ')));
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => (out.push(String(s)), true));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const qbtPath = () => join(section, 'qbt', '_QBT__Scratch_Pack.tex');
const yamlPath = () => join(section, 'ms', '_QBT___MS__Scratch_Pack.yaml');

function scheme() {
  const { pack } = readPack(qbtPath());
  return {
    format: 1,
    pack: 'Scratch Pack',
    last_updated: '1 October 2026',
    questions: [
      {
        q: 1,
        stamp: pack.questions[0].stamp,
        parts: [{ part: '', rows: [{ scheme: '\\(x = 1\\)\n', marks: [{ code: 'M1', note: 'Solves for \\(x\\).' }, { code: 'A1' }] }] }],
      },
      {
        q: 2,
        stamp: pack.questions[1].stamp,
        parts: [
          { part: 'a', rows: [{ scheme: '\\(y = 2\\)\n', marks: [{ code: 'B1' }] }] },
          { part: 'b', rows: [{ scheme: '\\(z = 3\\)\n', marks: [{ code: 'B1' }, { code: 'B1' }] }] },
        ],
      },
    ],
  };
}

function json(name, value) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

describe('parseArgs', () => {
  it('reads a command, its arguments and its flags', () => {
    expect(parseArgs(['write', 'a.json', '--to', 'b.yaml', '--only=3, 5'])).toEqual({
      command: 'write',
      args: ['a.json'],
      flags: { '--to': 'b.yaml', '--only': '3, 5' },
    });
  });

  it('refuses an unknown command or flag', () => {
    expect(() => parseArgs(['render', 'x'])).toThrow(/expected a command/);
    expect(() => parseArgs(['format', 'x', '--only', '3'])).toThrow(/unknown flag/);
    expect(main(['stamp', 'x.yaml', '--force'])).toBe(2);
  });
});

describe('the commands', () => {
  it('pack --json gives the questions, stamps, parts and paths', () => {
    expect(main(['pack', qbtPath(), '--json'])).toBe(0);
    const data = JSON.parse(out.join(''));
    expect(data.format).toBe(1);
    expect(data.title).toBe('Scratch Pack');
    expect(data.files.conventions).toBe('public/tex/_shared/markscheme_conventions.tex');
    expect(data.questions.map((q) => q.parts)).toEqual([
      [{ part: '', marks: 2 }],
      [{ part: 'a', marks: 1 }, { part: 'b', marks: 2 }],
    ]);
    expect(data.questions[0].solution).toBe('\\(x = 1\\).');
  });

  it('write, check, parse: a scheme survives parse then write byte for byte', () => {
    expect(main(['write', json('s.json', scheme()), '--to', yamlPath()])).toBe(0);
    const written = readFileSync(yamlPath(), 'utf8');
    expect(main(['check', yamlPath()])).toBe(0);
    out = [];
    expect(main(['parse', yamlPath()])).toBe(0);
    const again = join(dir, 'again.yaml');
    expect(main(['write', json('back.json', JSON.parse(out.join(''))), '--to', again])).toBe(0);
    expect(readFileSync(again, 'utf8')).toBe(written);
    out = [];
    expect(main(['parse', yamlPath(), '--question', '2'])).toBe(0);
    expect(JSON.parse(out.join('')).q).toBe(2);
  });

  it('write keeps a CRLF file CRLF, and write --only leaves the other questions alone', () => {
    writeFileSync(yamlPath(), emitScheme(scheme()).replace(/\n/g, '\r\n'));
    const q2 = scheme().questions[1];
    q2.parts[0].rows[0].scheme = '\\(y = 1 + 1\\)\n';
    expect(main(['write', json('q2.json', q2), '--to', yamlPath(), '--only', '2'])).toBe(0);
    const text = readFileSync(yamlPath(), 'utf8');
    expect(text).toContain('\r\n');
    expect(text).toContain('y = 1 + 1');
    expect(text.slice(0, text.indexOf('  - q: 2'))).toBe(emitScheme(scheme()).replace(/\n/g, '\r\n').slice(0, text.indexOf('  - q: 2')));
  });

  it('write refuses data it cannot write, and --only into a file not in canonical form', () => {
    expect(main(['write', json('bad.json', { ...scheme(), extra: 1 }), '--to', yamlPath()])).toBe(1);
    writeFileSync(yamlPath(), emitScheme(scheme()).replace('format: 1', 'format:  1'));
    expect(main(['write', json('q.json', scheme().questions[0]), '--to', yamlPath(), '--only', '1'])).toBe(2);
    expect(err.join('\n')).toMatch(/not in canonical form/);
  });

  it('format rewrites a file in canonical form', () => {
    writeFileSync(yamlPath(), emitScheme(scheme()).replace('format: 1', 'format:   1'));
    expect(main(['check', yamlPath()])).toBe(1);
    expect(main(['format', yamlPath()])).toBe(0);
    expect(readFileSync(yamlPath(), 'utf8')).toBe(emitScheme(scheme()));
    expect(main(['check', yamlPath()])).toBe(0);
  });

  it('check over a scope finds the schemes in ms/ folders; --draft allows flags', () => {
    const flagged = scheme();
    flagged.questions[1].parts[1] = { part: 'b', flag: { kind: 'solution_error', why: 'The value of z is wrong.' } };
    writeFileSync(yamlPath(), emitScheme(flagged));
    expect(main(['check', yamlPath()])).toBe(1);
    expect(err.join('\n')).toMatch(/\[rule 24\]/);
    expect(main(['check', yamlPath(), '--draft'])).toBe(0);
  });

  it('check --question --json is the accept', () => {
    const q = scheme().questions[1];
    delete q.stamp;
    const codes = json('codes.json', { parts: [{ q: 2, part: 'a', codes: ['B1'] }, { q: 2, part: 'b', codes: ['B1', 'B1'] }] });
    expect(main(['check', '--question', json('q.json', q), '--pack', qbtPath(), '--codes', codes, '--json'])).toBe(0);
    expect(JSON.parse(out.join(''))).toEqual({ ok: true, errors: [], warnings: [] });
    out = [];
    q.parts[1].rows[0].marks.pop();
    expect(main(['check', '--question', json('q.json', q), '--pack', qbtPath(), '--codes', codes, '--json'])).toBe(1);
    const result = JSON.parse(out.join(''));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.rule)).toEqual([8, 14]);
  });

  it('stamp sets the named questions to their stamp now', () => {
    const stale = scheme();
    stale.questions[0].stamp = '00000000';
    stale.questions[1].stamp = '00000000';
    writeFileSync(yamlPath(), emitScheme(stale));
    expect(main(['stamp', yamlPath(), '--only', '1'])).toBe(0);
    const text = readFileSync(yamlPath(), 'utf8');
    expect(text).toContain(`stamp: ${scheme().questions[0].stamp}`);
    expect(text).toContain("stamp: '00000000'");
  });

  it('renumber follows a reorder, and refuses when a stamp no longer matches', () => {
    writeFileSync(yamlPath(), emitScheme(scheme()));
    setPack([1, 0]);
    expect(main(['check', yamlPath()])).toBe(1);
    expect(main(['renumber', yamlPath()])).toBe(0);
    expect(main(['check', yamlPath()])).toBe(0);
    const { pack } = readPack(qbtPath());
    expect(pack.questions.map((q) => q.parts.length)).toEqual([2, 1]);

    setPack();
    writeFileSync(yamlPath(), emitScheme(scheme()));
    setPack([1, 0], (s) => s.replace('Find \\(x\\).', 'Find \\(x\\) exactly.'));
    expect(main(['renumber', yamlPath()])).toBe(1);
    expect(err.join('\n')).toMatch(/Q1 \(stamp [0-9a-f]{8}\) matches no question/);
  });
});
