# Plan: Source .tex button + auto-generated source hints

## Context

Daniel assembles bespoke question packs for students by copy-pasting `\questionitem` blocks out of the in-repo QBT `.tex` files. Today that means hunting the right `.tex` through the file tree, and once pasted, the block carries no indication of which pack it came from — so cross-checking against solutions (or later edits) is awkward.

Two small changes fix this:

1. **Viewer "Source .tex" button** — while reading a pack PDF on the site, one click opens the underlying `.tex` in a new tab. No new infrastructure: `public/tex/**/*.tex` is already served statically by Astro.
2. **Auto-generated per-question source hints** — `clean-tex` emits `% [Source: <filename-stem>, Q<N>]` immediately after each `\questionitem`, so any copy-pasted block self-identifies. Because `sync-questions` mirrors the QBT statement region (including the hint) into the soln file byte-identically, both files carry the same hint after the normal `clean-tex → sync-questions` pipeline — no per-file special-casing and no migration script.

Outcome: assembling a student pack becomes "click .tex, copy block, paste" with the pack + question number embedded as a comment.

---

## Part 1 — Source .tex button in viewer

### File: `src/pages/view/[id].astro`

**Frontmatter (near the existing `paired`/`downloadName` logic, ~line 77):**

```ts
// `resource.file` includes `?v=<hash>` for cache-busting — strip before .tex swap.
// Guard on `resource.type` being defined: TMUA rows have no type, no .tex source.
const texHref = resource.type
  ? resource.file.split('?')[0].replace(/\.pdf$/, '.tex')
  : null;
```

Applies to `questions`, `solutions`, and `notes`. (Notes aren't processed by `clean-tex`, so their `.tex` has no hints — button still useful for viewing source.)

**Navbar button (between split toggle and Download, ~line 197):**

```astro
{texHref && (
  <a
    href={texHref}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Open LaTeX source in new tab"
    title="Open LaTeX source (.tex)"
    class="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/80 text-sm font-medium transition-colors"
  >
    {/* code-brackets icon */}
    <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
    <span class="hidden sm:inline">.tex</span>
  </a>
)}
```

Styling matches the Download anchor. No `data-hide-on-split` (source access is orthogonal to pair viewing). Desktop and narrow-desktop only via the same `sm:` label truncation the Download button uses; mobile landing card is left alone (the landing card is a consumer surface, `.tex` is an authoring affordance).

---

## Part 2 — Auto-generated source hints

### Hint format

`% [Source: <filename-stem>, Q<N>]` where `<stem>` = `basename(absPath, '.tex')`.

- QBT file `_QBT__De_Moivres_Theorem.tex` → `% [Source: _QBT__De_Moivres_Theorem, Q3]`
- After `sync-questions` runs, the soln pair `_QBT___Solns__De_Moivres_Theorem.tex` contains the same QBT-derived hint byte-identically (statement region is mirrored).

### Placement

Immediately after each `\questionitem`:

```latex
% ---- Question 3 ----
\questionitem
% [Source: _QBT__De_Moivres_Theorem, Q3]
<statement body>
```

Confirmed safe against `scripts/lib/question-blocks.mjs`:
- `parseDoc` block boundary uses `DELIM_RE = /^% ---- Question (\d+) ----$/`; intermediate lines are opaque.
- `extractQbtStatement` returns `block.lines.slice(1)` — hint becomes first statement line and is mirrored.
- `splitSolnBlock` locates the Solution tcolorbox via `/\\begin\{tcolorbox\}.*title=\{\\textbf\{Solution\}\}/`; a comment line is correctly classified as statement content.
- `validateBlocks` counts via `/\\questionitem\b/` and excludes `\newcommand` lines — comments irrelevant.
- `count-questions.mjs` counts `\\questionitem` only — hints don't inflate counts.

### File: `scripts/clean-tex.mjs`

Replace `insertQuestionDelimiters(bodyLines)` with a combined emitter so delimiter N and hint N can never drift:

```js
export function insertQuestionDelimitersAndHints(bodyLines, fileStem) {
  const out = [];
  let n = 0;
  for (const line of bodyLines) {
    if (QUESTION_ITEM_LINE.test(line)) {
      n++;
      out.push(`% ---- Question ${n} ----`);
      out.push(line);
      out.push(`% [Source: ${fileStem}, Q${n}]`);
    } else {
      out.push(line);
    }
  }
  return out;
}
```

Update `processContent(text, fileStem)` to accept the stem and forward it. In `main()`, compute via `basename(absPath, '.tex')` (add `basename` to the existing `'node:path'` import).

Idempotence preserved: `stripBodyLines` still nukes all full-line comments (including stale hints/delimiters) before the combined emitter re-writes them from scratch.

### File: `scripts/check-tex.mjs`

Extend the allow-list. Stem is restricted to `[A-Za-z0-9_]` (matching actual filename conventions) as a cheap sanity check:

```js
const ALLOWED_FULL_LINE_COMMENTS = [
  /^\s*% ---- Question \d+ ----\s*$/,
  /^\s*% \[Source: [A-Za-z0-9_]+, Q\d+\]\s*$/,
];

export function isUnexpectedFullLineComment(line) {
  const t = line.trimStart();
  if (t.length === 0 || t[0] !== '%') return false;
  return !ALLOWED_FULL_LINE_COMMENTS.some((re) => re.test(line));
}
```

### File: `scripts/clean-tex.test.mjs`

- Replace `insertQuestionDelimiters` import with `insertQuestionDelimitersAndHints`.
- Port existing 4 tests to the new signature, passing a fixture stem (e.g. `'_QBT__Foo'`).
- Add tests for:
  - Hint emitted after `\questionitem` with matching N (`Q1`, `Q2`).
  - Sequential numbering for multiple items.
  - `processContent(text, stem)` end-to-end: input body with stale hint → output contains exactly one fresh hint per `\questionitem` (demonstrates strip-then-reinsert).
  - Idempotence: `processContent(processContent(input, stem), stem) === processContent(input, stem)`.

### File: `scripts/check-tex.test.mjs`

- Keep all existing cases.
- Add cases:
  - `'% [Source: _QBT__Foo, Q1]'` → false (allowed)
  - `'% [Source: _QBT___Solns__Foo, Q42]'` → false (allowed — underscores valid)
  - `'% [Source: foo bar, Q1]'` → true (space in stem — flagged)
  - `'% [Source: foo, Qx]'` → true (non-digit Q-number — flagged)
  - `'  % [Source: _QBT__Foo, Q1]'` → false (indented allowed variant)

---

## Execution order

All changes land in a single commit (pre-commit runs vitest + `check-tex` + `check-questions` together, so scripts, tests, and backfilled `.tex` must be coherent at commit time).

1. Edit `scripts/check-tex.mjs` + `scripts/check-tex.test.mjs`.
2. Edit `scripts/clean-tex.mjs` + `scripts/clean-tex.test.mjs`.
3. `npx vitest run` — confirm all tests pass.
4. `npm run clean-tex` — backfills hints across every tracked QBT and soln `.tex` using each file's own stem.
5. `npm run sync-questions` — rewrites soln statement regions from QBT, so soln hints now carry the QBT stem (the desired end state).
6. `npm run check-questions` — expect `0 drifted, 0 broken`.
7. `npm run check-tex` — expect clean.
8. Edit `src/pages/view/[id].astro` (Part 1).
9. `npm run build` — confirm Astro build succeeds.
10. `git status` — verify no PDFs changed (hints are LaTeX comments; rendering unaffected).
11. Stage `.tex`, scripts, tests, and `[id].astro` together; commit.

---

## Files modified

- `src/pages/view/[id].astro`
- `scripts/check-tex.mjs`
- `scripts/check-tex.test.mjs`
- `scripts/clean-tex.mjs`
- `scripts/clean-tex.test.mjs`
- Every `public/tex/**/qbt/_QBT__*.tex` and `public/tex/**/soln/_QBT___Solns__*.tex` (mechanically, via `clean-tex` + `sync-questions`)

No schema changes to `src/data/resources.ts`, `scripts/lib/*`, or CI config.

---

## Verification

**Unit tests** — `npx vitest run` covers:
- `check-tex`: new hint pattern allowed, malformed variants flagged, existing delimiter cases still pass.
- `clean-tex`: hint emitted after each `\questionitem` with matching N, `processContent` idempotent, strip-then-reinsert refreshes stale hints.

**Integration** — run full toolchain end-to-end:
```pwsh
npm run clean-tex
npm run sync-questions
npm run check-questions    # 0 drifted, 0 broken
npm run check-tex          # all clean
npm run check-resources    # still passes (no resource schema changes)
```

**Spot-check** — pick one pair, e.g.:
- `public/tex/further-maths/core-pure/complex-numbers/qbt/_QBT__De_Moivres_Theorem.tex`
- `public/tex/further-maths/core-pure/complex-numbers/soln/_QBT___Solns__De_Moivres_Theorem.tex`

Both should show `% [Source: _QBT__De_Moivres_Theorem, Q1]` (QBT stem) immediately after each `\questionitem`. Byte-for-byte identical in the statement region.

**Browser** — `npm run dev`, open `/view/fm-complex-de-moivres-theorem`:
- "Source .tex" button visible in navbar between split toggle and Download.
- Click → new tab opens `/tex/.../qbt/_QBT__De_Moivres_Theorem.tex`; browser renders as plain text with hints visible.
- Visit `/view/tmua-setA-paper1` → button absent (TMUA has no `type`).

**PDF regression** — `git status` after backfill should show only `.tex` changes; no `.pdf` bytes change because LaTeX comments don't affect rendering.
