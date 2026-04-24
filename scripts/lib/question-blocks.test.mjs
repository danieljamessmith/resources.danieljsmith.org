import { describe, it, expect } from 'vitest';
import {
  parseDoc,
  serializeDoc,
  stripTrailingNewpage,
  extractQbtStatement,
  splitSolnBlock,
  rewriteSolnStatement,
  syncPair,
  validateBlocks,
} from './question-blocks.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal QBT document with two questions. */
const QBT_TWO_Q = [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\begin{enumerate}[label=\\textbf{\\arabic*.}]',
  '',
  '% ---- Question 1 ----',
  '\\questionitem',
  '',
  'First question statement.',
  '',
  '\\newpage',
  '',
  '% ---- Question 2 ----',
  '\\questionitem',
  '',
  'Second question statement.',
  '\\end{enumerate}',
  '\\end{document}',
].join('\n');

/** Matching SOLN document with a Solution tcolorbox per question. */
const SOLN_TWO_Q = [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\begin{enumerate}[label=\\textbf{\\arabic*.}]',
  '',
  '% ---- Question 1 ----',
  '\\questionitem',
  '',
  'First question statement.',
  '',
  '\\vspace*{10pt}',
  '',
  '\\begin{tcolorbox}[colback=white, colframe=scarlet, title={\\textbf{Solution}}, breakable]',
  'Solution to Q1.',
  '\\end{tcolorbox}',
  '',
  '\\newpage',
  '',
  '% ---- Question 2 ----',
  '\\questionitem',
  '',
  'Second question statement.',
  '',
  '\\vspace*{10pt}',
  '',
  '\\begin{tcolorbox}[colback=white, colframe=scarlet, title={\\textbf{Solution}}, breakable]',
  'Solution to Q2.',
  '\\end{tcolorbox}',
  '\\end{enumerate}',
  '\\end{document}',
].join('\n');

// ---------------------------------------------------------------------------
// parseDoc
// ---------------------------------------------------------------------------

describe('parseDoc', () => {
  it('splits a two-question QBT into preamble + blocks + postamble', () => {
    const doc = parseDoc(QBT_TWO_Q);
    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks[0].n).toBe(1);
    expect(doc.blocks[1].n).toBe(2);
    expect(doc.blocks[0].lines[0]).toBe('% ---- Question 1 ----');
    expect(doc.blocks[1].lines[0]).toBe('% ---- Question 2 ----');
    expect(doc.preamble).toEqual(['\\begin{enumerate}[label=\\textbf{\\arabic*.}]', '']);
    expect(doc.postamble[0]).toBe('\\end{enumerate}');
  });

  it('throws when document boundaries are missing', () => {
    expect(() => parseDoc('% ---- Question 1 ----\n\\questionitem\nFoo.\n')).toThrow(
      /missing.*begin\{document\}/,
    );
  });

  it('handles a doc with no question delimiters', () => {
    const doc = parseDoc('\\begin{document}\nNo questions here.\n\\end{document}\n');
    expect(doc.blocks).toEqual([]);
    expect(doc.preamble).toEqual(['No questions here.']);
    expect(doc.postamble).toEqual([]);
  });

  it('handles \\r\\n line endings', () => {
    const crlf = QBT_TWO_Q.replace(/\n/g, '\r\n');
    const doc = parseDoc(crlf);
    expect(doc.blocks).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// serializeDoc round-trip
// ---------------------------------------------------------------------------

describe('serializeDoc', () => {
  it('round-trips QBT_TWO_Q with no edits', () => {
    const doc = parseDoc(QBT_TWO_Q);
    expect(serializeDoc(doc, doc.blocks)).toBe(QBT_TWO_Q);
  });

  it('round-trips SOLN_TWO_Q with no edits', () => {
    const doc = parseDoc(SOLN_TWO_Q);
    expect(serializeDoc(doc, doc.blocks)).toBe(SOLN_TWO_Q);
  });

  it('preserves CRLF line endings on round-trip', () => {
    const crlf = SOLN_TWO_Q.replace(/\n/g, '\r\n');
    const doc = parseDoc(crlf);
    expect(doc.eol).toBe('\r\n');
    expect(serializeDoc(doc, doc.blocks)).toBe(crlf);
  });

  it('preserves LF line endings on round-trip', () => {
    const doc = parseDoc(SOLN_TWO_Q);
    expect(doc.eol).toBe('\n');
    expect(serializeDoc(doc, doc.blocks)).toBe(SOLN_TWO_Q);
  });
});

// ---------------------------------------------------------------------------
// stripTrailingNewpage
// ---------------------------------------------------------------------------

describe('stripTrailingNewpage', () => {
  it('removes a trailing \\newpage and surrounding blanks', () => {
    expect(stripTrailingNewpage(['Foo.', '', '\\newpage', ''])).toEqual(['Foo.']);
  });

  it('is a no-op when there is no trailing newpage', () => {
    expect(stripTrailingNewpage(['Foo.', 'Bar.'])).toEqual(['Foo.', 'Bar.']);
  });

  it('strips multiple trailing newpages', () => {
    expect(stripTrailingNewpage(['Foo.', '', '\\newpage', '', '\\newpage'])).toEqual(['Foo.']);
  });

  it('preserves an internal newpage', () => {
    expect(stripTrailingNewpage(['Foo.', '\\newpage', 'Bar.'])).toEqual(['Foo.', '\\newpage', 'Bar.']);
  });
});

// ---------------------------------------------------------------------------
// extractQbtStatement
// ---------------------------------------------------------------------------

describe('extractQbtStatement', () => {
  it('returns body without delimiter or trailing \\newpage', () => {
    const doc = parseDoc(QBT_TWO_Q);
    expect(extractQbtStatement(doc.blocks[0])).toEqual([
      '\\questionitem',
      '',
      'First question statement.',
    ]);
  });

  it('handles last block which has no \\newpage', () => {
    const doc = parseDoc(QBT_TWO_Q);
    expect(extractQbtStatement(doc.blocks[1])).toEqual([
      '\\questionitem',
      '',
      'Second question statement.',
    ]);
  });
});

// ---------------------------------------------------------------------------
// splitSolnBlock
// ---------------------------------------------------------------------------

describe('splitSolnBlock', () => {
  it('returns statement, prelude+tcolorbox+trailer for a normal block', () => {
    const doc = parseDoc(SOLN_TWO_Q);
    const split = splitSolnBlock(doc.blocks[0]);
    expect(split).not.toBeNull();
    expect(split.statement).toEqual([
      '\\questionitem',
      '',
      'First question statement.',
    ]);
    expect(split.solutionRegion[0]).toBe('');
    expect(split.solutionRegion).toContain('\\vspace*{10pt}');
    expect(split.solutionRegion.some((l) => /title=\{\\textbf\{Solution\}\}/.test(l))).toBe(true);
  });

  it('returns null when the block has no Solution tcolorbox', () => {
    const noSoln = [
      '\\begin{document}',
      '\\begin{enumerate}',
      '% ---- Question 1 ----',
      '\\questionitem',
      'Statement only, no solution yet.',
      '\\end{enumerate}',
      '\\end{document}',
    ].join('\n');
    const doc = parseDoc(noSoln);
    expect(splitSolnBlock(doc.blocks[0])).toBeNull();
  });

  it('ignores non-Solution tcolorboxes inside the statement', () => {
    const withInfoBox = [
      '\\begin{document}',
      '\\begin{enumerate}',
      '% ---- Question 1 ----',
      '\\questionitem',
      'Statement.',
      '\\begin{tcolorbox}[enhanced,boxrule=0.4pt,colback=white]',
      'Some info box inside the statement.',
      '\\end{tcolorbox}',
      'More statement after the info box.',
      '',
      '\\vspace*{10pt}',
      '',
      '\\begin{tcolorbox}[colback=white, title={\\textbf{Solution}}]',
      'The actual solution.',
      '\\end{tcolorbox}',
      '\\end{enumerate}',
      '\\end{document}',
    ].join('\n');
    const doc = parseDoc(withInfoBox);
    const split = splitSolnBlock(doc.blocks[0]);
    expect(split).not.toBeNull();
    expect(split.statement).toContain('More statement after the info box.');
    expect(split.statement.some((l) => l.includes('title={\\textbf{Solution}}'))).toBe(false);
  });

  it('finds Solution tcolorbox in the LAST block when its statement and solution both contain inner enumerates at column 0 (regression)', () => {
    // Mirrors the real-corpus shape that exposed the postamble bug: every
    // final question across further-maths got mis-flagged as "no Solution
    // tcolorbox yet" because the parser truncated the last block at the
    // first column-0 `\end{enumerate}` (which is the inner part-list close
    // INSIDE the statement), placing the Solution box into the postamble.
    const text = [
      '\\begin{document}',
      '\\begin{enumerate}[label=\\textbf{\\arabic*.}]',
      '',
      '% ---- Question 1 ----',
      '\\questionitem',
      '',
      'Statement intro.',
      '\\begin{enumerate}[label=\\textbf{(\\alph*)}]',
      '  \\item First part of the statement.',
      '  \\item Second part of the statement.',
      '\\end{enumerate}',
      '',
      '\\vspace*{10pt}',
      '',
      '\\begin{tcolorbox}[colback=white, title={\\textbf{Solution}}]',
      '\\begin{enumerate}[label=\\textbf{(\\alph*)}]',
      '  \\item Solution to part (a).',
      '  \\item Solution to part (b).',
      '\\end{enumerate}',
      '\\end{tcolorbox}',
      '\\end{enumerate}',
      '\\end{document}',
    ].join('\n');
    const doc = parseDoc(text);
    expect(doc.blocks).toHaveLength(1);
    const split = splitSolnBlock(doc.blocks[0]);
    expect(split).not.toBeNull();
    expect(split.statement.some((l) => l.includes('First part of the statement.'))).toBe(true);
    expect(split.solutionRegion.some((l) => /title=\{\\textbf\{Solution\}\}/.test(l))).toBe(true);
    expect(serializeDoc(doc, doc.blocks)).toBe(text);
  });

  it('handles a block with no \\vspace*{} prelude', () => {
    const noPrelude = [
      '\\begin{document}',
      '\\begin{enumerate}',
      '% ---- Question 1 ----',
      '\\questionitem',
      'Statement.',
      '',
      '\\begin{tcolorbox}[colback=white, title={\\textbf{Solution}}]',
      'Solution.',
      '\\end{tcolorbox}',
      '\\end{enumerate}',
      '\\end{document}',
    ].join('\n');
    const doc = parseDoc(noPrelude);
    const split = splitSolnBlock(doc.blocks[0]);
    expect(split).not.toBeNull();
    expect(split.statement).toEqual(['\\questionitem', 'Statement.']);
  });
});

// ---------------------------------------------------------------------------
// rewriteSolnStatement
// ---------------------------------------------------------------------------

describe('rewriteSolnStatement', () => {
  it('replaces statement, preserves prelude + tcolorbox + trailer', () => {
    const doc = parseDoc(SOLN_TWO_Q);
    const block = doc.blocks[0];
    const rewritten = rewriteSolnStatement(block, [
      '\\questionitem',
      '',
      'First question statement (edited).',
    ]);
    expect(rewritten).not.toBeNull();
    const text = rewritten.lines.join('\n');
    expect(text).toContain('First question statement (edited).');
    expect(text).toContain('\\vspace*{10pt}');
    expect(text).toContain('Solution to Q1.');
    expect(text).toContain('\\newpage');
  });

  it('is a no-op when newStatement matches the existing statement', () => {
    const doc = parseDoc(SOLN_TWO_Q);
    const block = doc.blocks[0];
    const split = splitSolnBlock(block);
    const rewritten = rewriteSolnStatement(block, split.statement);
    expect(rewritten.lines).toEqual(block.lines);
  });

  it('returns null when the block has no Solution tcolorbox', () => {
    const noSoln = parseDoc(
      [
        '\\begin{document}',
        '\\begin{enumerate}',
        '% ---- Question 1 ----',
        '\\questionitem',
        'No solution yet.',
        '\\end{enumerate}',
        '\\end{document}',
      ].join('\n'),
    );
    expect(rewriteSolnStatement(noSoln.blocks[0], ['\\questionitem', 'New stmt.'])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// syncPair (end-to-end)
// ---------------------------------------------------------------------------

describe('syncPair', () => {
  it('is a no-op when QBT and SOLN statements already match', () => {
    const result = syncPair(QBT_TWO_Q, SOLN_TWO_Q);
    expect(result.fatal).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.changes).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.newSolnText).toBe(SOLN_TWO_Q);
  });

  it('preserves SOLN source metadata when only source hints differ', () => {
    const qbtWithSource = QBT_TWO_Q.replace(
      ['\\questionitem', '', 'First question statement.'].join('\n'),
      ['\\questionitem', '% [Source: _QBT__Foo, Q1]', '', 'First question statement.'].join('\n'),
    );
    const solnWithSource = SOLN_TWO_Q.replace(
      ['\\questionitem', '', 'First question statement.'].join('\n'),
      ['\\questionitem', '% [Source: _QBT___Solns__Foo, Q1]', '', 'First question statement.'].join('\n'),
    );

    const result = syncPair(qbtWithSource, solnWithSource);

    expect(result.fatal).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.changes).toEqual([]);
    expect(result.newSolnText).toBe(solnWithSource);
  });

  it('rewrites SOLN statements to match QBT after a QBT edit', () => {
    const editedQbt = QBT_TWO_Q.replace('First question statement.', 'First question statement (edited).');
    const result = syncPair(editedQbt, SOLN_TWO_Q);
    expect(result.fatal).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].n).toBe(1);
    expect(result.newSolnText).toContain('First question statement (edited).');
    expect(result.newSolnText).toContain('Solution to Q1.');
  });

  it('keeps SOLN source metadata while rewriting edited QBT text', () => {
    const qbtWithSource = QBT_TWO_Q.replace(
      ['\\questionitem', '', 'First question statement.'].join('\n'),
      ['\\questionitem', '% [Source: _QBT__Foo, Q1]', '', 'First question statement (edited).'].join('\n'),
    );
    const solnWithSource = SOLN_TWO_Q.replace(
      ['\\questionitem', '', 'First question statement.'].join('\n'),
      ['\\questionitem', '% [Source: _QBT___Solns__Foo, Q1]', '', 'First question statement.'].join('\n'),
    );

    const result = syncPair(qbtWithSource, solnWithSource);

    expect(result.fatal).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.newSolnText).toContain('% [Source: _QBT___Solns__Foo, Q1]');
    expect(result.newSolnText).not.toContain('% [Source: _QBT__Foo, Q1]');
    expect(result.newSolnText).toContain('First question statement (edited).');
  });

  it('refuses to rewrite when QBT and SOLN have different question numbers', () => {
    const qbt3 = QBT_TWO_Q.replace('% ---- Question 2 ----', '% ---- Question 3 ----');
    const result = syncPair(qbt3, SOLN_TWO_Q);
    expect(result.fatal).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.newSolnText).toBe(SOLN_TWO_Q);
    expect(result.issues.some((i) => i.kind === 'qbt-only' && i.n === 3)).toBe(true);
    expect(result.issues.some((i) => i.kind === 'soln-only' && i.n === 2)).toBe(true);
  });

  it('warns and skips a soln block with no solution yet', () => {
    const solnNoQ2 = SOLN_TWO_Q.replace(
      [
        '',
        '\\vspace*{10pt}',
        '',
        '\\begin{tcolorbox}[colback=white, colframe=scarlet, title={\\textbf{Solution}}, breakable]',
        'Solution to Q2.',
        '\\end{tcolorbox}',
      ].join('\n'),
      '',
    );
    const result = syncPair(QBT_TWO_Q, solnNoQ2);
    expect(result.fatal).toBe(false);
    expect(result.issues.some((i) => i.kind === 'no-solution' && i.n === 2)).toBe(true);
  });

  it('flags duplicate question delimiters as fatal', () => {
    const dup = SOLN_TWO_Q.replace('% ---- Question 2 ----', '% ---- Question 1 ----');
    const result = syncPair(QBT_TWO_Q, dup);
    expect(result.fatal).toBe(true);
    expect(result.issues.some((i) => i.kind === 'duplicate-delim-soln')).toBe(true);
  });

  it('round-trips byte-perfect when no edits are needed', () => {
    const result = syncPair(QBT_TWO_Q, SOLN_TWO_Q);
    expect(result.newSolnText).toBe(SOLN_TWO_Q);
  });
});

// ---------------------------------------------------------------------------
// validateBlocks
// ---------------------------------------------------------------------------

describe('validateBlocks', () => {
  it('returns no issues for a well-formed two-question doc', () => {
    const doc = parseDoc(QBT_TWO_Q);
    expect(validateBlocks(doc, 'qbt')).toEqual([]);
  });

  it('flags a block that is missing \\questionitem', () => {
    // Drop the \questionitem line from Q2 only.
    const broken = QBT_TWO_Q.replace(
      ['% ---- Question 2 ----', '\\questionitem'].join('\n'),
      '% ---- Question 2 ----',
    );
    const doc = parseDoc(broken);
    const issues = validateBlocks(doc, 'qbt');
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('missing-questionitem-qbt');
    expect(issues[0].n).toBe(2);
  });

  it('tags issues with the correct side suffix (soln)', () => {
    const broken = SOLN_TWO_Q.replace(
      ['% ---- Question 2 ----', '\\questionitem'].join('\n'),
      '% ---- Question 2 ----',
    );
    const doc = parseDoc(broken);
    const issues = validateBlocks(doc, 'soln');
    expect(issues.some((i) => i.kind === 'missing-questionitem-soln' && i.n === 2)).toBe(true);
  });

  it('flags a block with more than one \\questionitem', () => {
    const broken = QBT_TWO_Q.replace(
      ['% ---- Question 2 ----', '\\questionitem'].join('\n'),
      ['% ---- Question 2 ----', '\\questionitem', '\\questionitem'].join('\n'),
    );
    const doc = parseDoc(broken);
    const issues = validateBlocks(doc, 'qbt');
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('extra-questionitem-qbt');
    expect(issues[0].n).toBe(2);
    expect(issues[0].detail).toMatch(/2 \\questionitem/);
  });

  it('flags a delimiter-numbering gap (1,2,4)', () => {
    const gappy = [
      '\\begin{document}',
      '\\begin{enumerate}',
      '% ---- Question 1 ----',
      '\\questionitem',
      'Q1.',
      '% ---- Question 2 ----',
      '\\questionitem',
      'Q2.',
      '% ---- Question 4 ----',
      '\\questionitem',
      'Q4.',
      '\\end{enumerate}',
      '\\end{document}',
    ].join('\n');
    const doc = parseDoc(gappy);
    const issues = validateBlocks(doc, 'qbt');
    expect(issues.some((i) => i.kind === 'delim-numbering-gap-qbt')).toBe(true);
    expect(issues.find((i) => i.kind === 'delim-numbering-gap-qbt').detail).toContain('1,2,4');
  });

  it('flags out-of-order delimiters as a numbering gap', () => {
    const outOfOrder = [
      '\\begin{document}',
      '\\begin{enumerate}',
      '% ---- Question 1 ----',
      '\\questionitem',
      'Q1.',
      '% ---- Question 3 ----',
      '\\questionitem',
      'Q3.',
      '% ---- Question 2 ----',
      '\\questionitem',
      'Q2.',
      '\\end{enumerate}',
      '\\end{document}',
    ].join('\n');
    const doc = parseDoc(outOfOrder);
    const issues = validateBlocks(doc, 'qbt');
    expect(issues.some((i) => i.kind === 'delim-numbering-gap-qbt')).toBe(true);
  });

  it('does NOT report a numbering gap when the only issue is duplicates (avoids double-reporting)', () => {
    const dup = [
      '\\begin{document}',
      '\\begin{enumerate}',
      '% ---- Question 1 ----',
      '\\questionitem',
      'Q1.',
      '% ---- Question 1 ----',
      '\\questionitem',
      'Also Q1.',
      '\\end{enumerate}',
      '\\end{document}',
    ].join('\n');
    const doc = parseDoc(dup);
    const issues = validateBlocks(doc, 'qbt');
    expect(issues.some((i) => i.kind === 'delim-numbering-gap-qbt')).toBe(false);
  });

  it('returns no issues for a doc with no question blocks', () => {
    const doc = parseDoc('\\begin{document}\nNo questions here.\n\\end{document}\n');
    expect(validateBlocks(doc, 'qbt')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// syncPair: per-file structural issues are surfaced and fatal
// ---------------------------------------------------------------------------

describe('syncPair (validateBlocks integration)', () => {
  it('flags missing-questionitem-soln as fatal and surfaces the q-number', () => {
    // The Modelling_with_1st_Order regression: the soln file's Q2 block has
    // no \questionitem, so the downstream questions parse with an off-by-one
    // delimiter set. Without per-file validation the only signal would be
    // qbt-only/soln-only against the pair; with it, the diagnostic points at
    // the actual file and line.
    const brokenSoln = SOLN_TWO_Q.replace(
      ['% ---- Question 2 ----', '\\questionitem'].join('\n'),
      '% ---- Question 2 ----',
    );
    const result = syncPair(QBT_TWO_Q, brokenSoln);
    expect(result.fatal).toBe(true);
    expect(
      result.issues.some((i) => i.kind === 'missing-questionitem-soln' && i.n === 2),
    ).toBe(true);
    expect(result.changed).toBe(false);
  });

  it('flags missing-questionitem-qbt as fatal', () => {
    const brokenQbt = QBT_TWO_Q.replace(
      ['% ---- Question 2 ----', '\\questionitem'].join('\n'),
      '% ---- Question 2 ----',
    );
    const result = syncPair(brokenQbt, SOLN_TWO_Q);
    expect(result.fatal).toBe(true);
    expect(
      result.issues.some((i) => i.kind === 'missing-questionitem-qbt' && i.n === 2),
    ).toBe(true);
  });

  it('flags a shared delimiter gap in BOTH files (the case the pair-level checks would miss)', () => {
    // Both QBT and SOLN jump 1 → 3. The pair-level check (qbtNs vs solnNs)
    // sees identical delimiter sets and would otherwise treat the pair as
    // structurally fine; only the in-file gap check catches this.
    const qbtGap = [
      '\\begin{document}',
      '\\begin{enumerate}',
      '% ---- Question 1 ----',
      '\\questionitem',
      'Q1.',
      '% ---- Question 3 ----',
      '\\questionitem',
      'Q3.',
      '\\end{enumerate}',
      '\\end{document}',
    ].join('\n');
    const solnGap = [
      '\\begin{document}',
      '\\begin{enumerate}',
      '% ---- Question 1 ----',
      '\\questionitem',
      'Q1.',
      '',
      '\\vspace*{10pt}',
      '',
      '\\begin{tcolorbox}[title={\\textbf{Solution}}]',
      'Soln 1.',
      '\\end{tcolorbox}',
      '% ---- Question 3 ----',
      '\\questionitem',
      'Q3.',
      '',
      '\\vspace*{10pt}',
      '',
      '\\begin{tcolorbox}[title={\\textbf{Solution}}]',
      'Soln 3.',
      '\\end{tcolorbox}',
      '\\end{enumerate}',
      '\\end{document}',
    ].join('\n');
    const result = syncPair(qbtGap, solnGap);
    expect(result.fatal).toBe(true);
    expect(result.issues.some((i) => i.kind === 'delim-numbering-gap-qbt')).toBe(true);
    expect(result.issues.some((i) => i.kind === 'delim-numbering-gap-soln')).toBe(true);
    // No qbt-only / soln-only since the n-sets are identical.
    expect(result.issues.some((i) => i.kind === 'qbt-only')).toBe(false);
    expect(result.issues.some((i) => i.kind === 'soln-only')).toBe(false);
  });

  it('does NOT flag extra-questionitem as fatal (warning only)', () => {
    // An extra \questionitem inside one block is structurally weird but
    // doesn't break delimiter parity, so syncPair can still safely rewrite.
    const brokenSoln = SOLN_TWO_Q.replace(
      ['% ---- Question 2 ----', '\\questionitem'].join('\n'),
      ['% ---- Question 2 ----', '\\questionitem', '\\questionitem'].join('\n'),
    );
    const result = syncPair(QBT_TWO_Q, brokenSoln);
    expect(
      result.issues.some((i) => i.kind === 'extra-questionitem-soln' && i.n === 2),
    ).toBe(true);
    // Not fatal: the rewrite re-derives the statement from QBT, so the extra
    // \questionitem is squashed by the next sync-questions run.
    expect(result.fatal).toBe(false);
  });
});
