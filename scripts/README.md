# scripts/

Node tooling for the site: the importer, compile, hygiene checks and the
generators the npm hooks run. Read this before changing anything here. The
rules for the content itself (packs, dates, the value of g, TMUA files) are in
the root `AGENTS.md`.

## npm scripts

| Script | What it does |
|--------|--------------|
| `npm run test` | Vitest run over all `*.test.mjs` |
| `npm run check-tex` | Read-only hygiene check on QBT/soln `.tex` bodies: no full-line comments except the `% ---- Question N ----` delimiters and `% [Source: <file>, QN]` hints |
| `npm run check-solution-layout` | Read-only check that worked solutions follow the *Solution source layout* (blank lines around displays, `\frac` in sentences, `\mathrm` units, no `\!` before `\left`) |
| `npm run check-pack-preamble` | Read-only convention check for Further Maths QBT/Soln shared `pack_preamble.tex` wrappers, `\djsMechanicsPack` and preamble comments |
| `npm run clean-tex` | Strips full-line comments from QBT/soln bodies, collapses blank-line runs, re-numbers question delimiters |
| `npm run check-questions [scope]` | Read-only drift detector: reports any QBT/soln pair where the SOLN statement region differs from the QBT statement, plus structurally broken pairs (numbering mismatches, duplicate delimiters, missing/extra `\questionitem`, delimiter numbering gaps). Same scope arg as `compile-tex`. Non-zero exit on drift |
| `npm run sync-questions [scope]` | Rewrites SOLN statement regions in place to match QBT. Solution box content is never touched. Skips structurally broken pairs (run `check-questions` first to triage) |
| `npm run check-resources` | Read-only validator for `src/data/resources.ts` (see Catalogue and database checks). Non-zero exit on any violation |
| `npm run check-generated` | Read-only verifier that the `*.generated.ts` files in `src/data/` match what `count-questions` and `hash-assets` would produce now (catches stale generated state from `--no-verify` commits or hand-edits). Non-zero exit on staleness |
| `npm run check-pairs` | Read-only check that every topic with any pack asset has all four of QBT/soln `.tex`/`.pdf`, and that no tracked file under `public/tex` is missing |
| `npm run check-private-terms` | Read-only check that no private term appears in tracked/new text files (or, with `--message FILE`, a commit message). The list comes from `PRIVATE_TERMS` (CI secret), `PRIVATE_TERMS_FILE`, or `~/.config/private-terms.txt`; skipped if none. Hits are reported by term number only |
| `npm run mark-checked -- <solutions-id> [--date YYYY-MM-DD]` | Records in `src/data/reviews.json` that a pack's worked solutions were checked: the date (default today) and the current hash of the pack's `.tex` pair. Run it after the pack's last `.tex` edit. Without the `--`, npm swallows `--date` and today's date is recorded |
| `npm run mark-checked -- <solutions-id> --reordered` | After an edit that only put a pack's questions in a new order, keeps its existing check date and stores the new hash. Refuses unless the committed pack matched its record and both working-tree files are the committed ones with their questions reordered the same way (delimiters, source hints and `\djsLastUpdated` may differ) |
| `npm run review-status [scope \| solutions-id]` | Read-only report of packs never checked, checked and unchanged, or changed since their check. Scope as for `check-questions` (default `further-maths`); a solutions id reports one pack |
| `npm run compile-tex -- [scope] [--deploy]` | Bulk latexmk over `further-maths` (default) or `all`; `--deploy` copies built PDFs up beside the source on success. TMUA files are never compiled here (the `tmua` scope is refused) |
| `npm run import-pack -- [flags]` | Adds a pack from a local folder (see Importing a pack) |

Through npm, flags need `--` before them (`npm run import-pack -- --yes …`);
`node scripts/<name>.mjs …` takes them directly.

## Importing a pack

`scripts/import-pack.mjs` adds a Further Maths pack from a local folder. The
folder holds the questions and solutions documents: those `pack.json` names
(`format: 1`, with `topic`, `questions` and `solutions`), or else the two found
by file name (`(QBT) <Title>.tex` and `(QBT) [Solns] <Title>.tex`, falling back
to the only document with `\begin{document}`; `SKIP_TEX_FILES` lists scratch
files never taken for a pack document). Other files in the folder are ignored.

| Flag | Value |
|------|-------|
| `--folder DIR` | The pack folder |
| `--site-path STRAND/SECTION` | An existing section folder under `public/tex/further-maths/`, e.g. `core-pure/induction`. The strand folder is the last segment of its `href` in `src/data/topics.ts` |
| `--section NAME` | The site section, by its `topic` or its heading in `topics.ts`. Needed only for a section folder that holds no pack yet; otherwise the section comes from the packs filed there, and a `--section` that disagrees is refused. Folder names need not match section names |
| `--title TITLE` | The pack title: the header topic, the rows' `title` and the file names (`sanitizeTopic`) |
| `--boards IDS\|all` | Board ids separated by commas or spaces, each from the strand's own list (`EXAM_BOARDS` for Core Pure, `FM_MECH_EXAM_BOARDS` for Further Mechanics), or `all`, which leaves `boards` out of the row |
| `--id ID` | The questions row's id, lowercase kebab-case; the solutions row's is `<ID>-solns`. The default offered takes its prefix from the section's questions rows |
| `--yes` | Ask nothing: `--folder`, `--site-path`, `--title`, `--boards` and `--id` must all be given, with `--section` for a section folder with no pack yet, and a failed compile is an error |

Without `--yes`, anything not given is asked, and the section folder is picked
from a tree of `public/tex/further-maths/` (`scripts/lib/site-tree.mjs`). A run
without `--yes` and without a terminal fails rather than waiting.

What it does, in order:

1. Refuses a pack it can't import: an id or file already on the site (a pack
   on the site is edited there), a document using `\includegraphics` (packs
   are TikZ-only), or `\djsMechanicsPack` in a Further Mechanics pack's
   preambles missing, or present in any other pack.
2. Prepares both documents (`prepareImportedTex`): the shared-preamble wrapper
   (`\input{preamble.tex}` and old inline preambles are rewritten), the header
   title and `\djsSitePath`, `\djsMechanicsPack` kept, an existing
   `\djsLastUpdated` kept or today's date for an undated document, and every
   full-line comment removed except the question delimiters and source hints,
   preamble included. A test pins that last point on `prepareImportedTex`
   itself, not as a side effect of `clean-tex`.
3. Writes them to `<section>/qbt/_QBT__<Title>.tex` and
   `<section>/soln/_QBT___Solns__<Title>.tex`, compiles each with the editor's
   latexmk arguments into its `build/` folder and copies the PDF up. A failed
   compile prints the LaTeX errors from the log.
4. Writes the two rows into `src/data/resources.ts`
   (`scripts/lib/resources-write.mjs`) after the section's last pack, or, for a
   section's first pack, after its strand's last row under a
   `// --- A-level Further Maths: <strand> - <section> ---` line. The rows take
   the existing shape: `id` first; `id`, `file`, `type`, `pairId` and `topic`
   single-quoted; `category` as the constant; `title` double-quoted when it
   holds an apostrophe; `boards` on the questions row only. The file is parsed
   again, and the import fails unless both rows read back with those fields.
5. Runs `count-questions` and `hash-assets`, so every check passes straight
   after an import.

If any step fails, everything written is put back. It never creates a section
or a section folder: adding a section to `topics.ts` is a separate site change.

## Script module map

| Path | Purpose |
|------|---------|
| `scripts/import-pack.mjs` | Pack import from a local folder: checks, document preparation, compile, `resources.ts` rows, generators; flags for unattended runs |
| `scripts/compile-tex.mjs` | Bulk `latexmk` over `further-maths` or `all` (never TMUA); `--deploy` promotes built PDFs beside source |
| `scripts/check-tex.mjs` | Read-only body-comment hygiene check |
| `scripts/check-solution-layout.mjs` | Read-only *Solution source layout* check over Further Maths soln packs |
| `scripts/check-pack-preamble.mjs` | Read-only Further Maths shared-preamble wrapper convention check |
| `scripts/clean-tex.mjs` | Strips full-line body comments, collapses long blank runs, re-inserts numbered question delimiters |
| `scripts/migrate-fm-pack-preamble.mjs` | Mechanical codemod for migrating Further Maths QBT/Soln files to the shared pack preamble |
| `scripts/migrate-solution-boxes.mjs` | Idempotent codemod converting legacy Solution tcolorboxes in Further Maths SOLN packs to `djsSolution`; `--dry-run`, optional path-substring filters, non-zero exit if a box is skipped. Run it after importing an old-style pack; `import-pack` does not |
| `scripts/check-questions.mjs` | Read-only QBT ⇄ SOLN drift and structural integrity detector |
| `scripts/sync-questions.mjs` | Rewrites SOLN statement regions from QBT while preserving solution boxes and prelude |
| `scripts/check-resources.mjs` | Read-only validator for `src/data/resources.ts` and generated count coverage |
| `scripts/check-generated.mjs` | Read-only byte-match verifier for generated TS files |
| `scripts/check-pairs.mjs` | Read-only QBT/soln `.tex`/`.pdf` quartet and tracked-missing check |
| `scripts/check-private-terms.mjs` | Read-only private-term scan of the tree or a commit message (list kept outside the repo) |
| `scripts/count-questions.mjs` | npm pre-hook generator for `src/data/questionCounts.generated.ts` |
| `scripts/hash-assets.mjs` | npm pre-hook generator for `src/data/fileHashes.generated.ts` |
| `scripts/mark-checked.mjs` | Writes a pack's check date and `.tex` hash to `src/data/reviews.json`; `--reordered` carries an existing check across a pure reorder |
| `scripts/review-status.mjs` | Read-only report of each pack's check status from `src/data/reviews.json` |
| `scripts/lib/reviews.mjs` | `reviews.json` parse/render/atomic-write, `.tex` pair hashing (CRLF-insensitive) and status classification behind `mark-checked` and `review-status` |
| `scripts/lib/pack-preamble.mjs` | Further Maths pack path/depth helpers, shared-preamble migration, import normalization, initial dates, date validation, pack title and site-path read/write (`readPackIdentity`, `applyPackIdentity`), `\djsMechanicsPack` and preamble comments, and convention checks |
| `scripts/lib/pair-presence.mjs` | Pure quartet / tracked-missing checker behind `check-pairs` |
| `scripts/lib/private-terms.mjs` | Pure term-list parsing and whole-token matching behind `check-private-terms` |
| `scripts/lib/tex-utils.mjs` | Shared path, `.tex` discovery, document boundary, and QBT/soln pair helpers |
| `scripts/lib/question-blocks.mjs` | Pure parser/synchronizer for `check-questions` and `sync-questions`; preserves CRLF/LF. `questionOrderChange` recognises a file whose questions were only reordered |
| `scripts/lib/solution-boxes.mjs` | Pure legacy-Solution-box → `djsSolution` rewrite used by `migrate-solution-boxes` |
| `scripts/lib/solution-layout.mjs` | Pure display/paragraph tokenizer and layout rules behind `check-solution-layout` |
| `scripts/lib/site-tree.mjs` | Interactive section-folder picker for `import-pack` |
| `scripts/lib/resources-derive.mjs` | Regex-based introspection of `src/data/resources.ts` (rows, every `id:` key, board lists) and `src/data/topics.ts` (strands, their folders, sections and boards) for the importer and validation |
| `scripts/lib/resources-write.mjs` | Renders a pack's two rows, splices them into `resources.ts` as text and reads them back |
| `scripts/lib/resources-check.mjs` | Pure resource catalogue invariant checker |

## Script conventions

- Pure helpers go in `scripts/lib/` with colocated `*.test.mjs` coverage (the
  root `AGENTS.md`, Tests, has the testing rules).
- Use atomic writes for files consumed by agents or scripts: write to
  `<file>.<rand>.tmp`, then `renameSync`. `reviews.writeReviewsAtomic` is the
  reference pattern.
- Avoid new dependencies without good reason.
- `resources.ts` is read with regexes, not a TypeScript parser. Write rows in
  the existing shape (see Importing a pack, step 4); `check-resources` fails on
  any `id:` key that doesn't parse as a row.

## Catalogue and database checks

The pre-commit checks split responsibility cleanly:

- **`resources.ts` ↔ filesystem / generated counts:** `check-resources` and
  `scripts/lib/resources-check.mjs`. Every `id:` key in the catalogue parses
  as a row (the regex parser would otherwise drop it silently); every entry's
  `file` exists on disk; ids are unique; `pairId` resolves and is symmetric;
  partner types are `{questions, solutions}`; partner `topic` and `category`
  match; each `type: 'answers'` entry has a `paperId` naming a
  `type: 'questions'` entry in its category, at most one per paper, and no
  other entry carries `paperId`; `type: 'questions'` `/qbt/` entries are keyed
  in `questionCounts.generated.ts`; a Further Maths row's `topic` is a section
  of its strand in `topics.ts`, and its `boards` belong to its strand's list;
  each Further Maths QBT/soln entry's `.tex` header topic equals its `title`
  and its `\djsSitePath` names its strand and `topics.ts` section.
  `orphan-pdf` is currently a warning while the corpus has a known backlog.
- **Generated TS freshness:** `check-generated`. Generated files must
  byte-match what `count-questions` and `hash-assets` would produce now. It
  stays pre-commit-only because `pre*` hooks already run the generators first.
- **In-file QBT/SOLN structural integrity:** `validateBlocks` in
  `scripts/lib/question-blocks.mjs`, surfaced via `check-questions`. Each
  question block has exactly one `\questionitem`; delimiter numbers are
  exactly `1..K`.
- **Pair-level QBT ⇄ SOLN parity:** `syncPair` in
  `scripts/lib/question-blocks.mjs`. Question-number sets are equal; SOLN
  statement regions match QBT byte-for-byte.
- **Further Maths shared preamble convention:** `check-pack-preamble` ensures
  QBT/Soln `.tex` files under `public/tex/further-maths/` stay at the fixed
  depth and import `../../../../_shared/pack_preamble.tex` with the correct
  `\djsQbtHeader{}` / `\djsSolnHeader{}` macro, exactly one valid
  `\djsLastUpdated{D Month YYYY}` in the preamble, at most one complete
  `\djsSitePath{}{}` there (its presence and values are checked by
  `check-resources`), `\djsMechanicsPack` in the preamble of every Further
  Mechanics pack and of no other, and no full-line comment before
  `\begin{document}`.
