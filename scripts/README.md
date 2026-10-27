# scripts/

Node tooling for the site: the importer, compile, hygiene checks and the
generators the npm hooks run. Read this before changing anything here. The
rules for the content itself (packs, dates, the value of g, TMUA files) are in
the root `AGENTS.md`.

## npm scripts

| Script | What it does |
|--------|--------------|
| `npm run test` | Vitest run over all `*.test.mjs` |
| `npm run check-tex` | Read-only hygiene check on QBT/soln `.tex` bodies: no full-line comments except the `% ---- Question N ----` delimiters and `% [Source: <file>, QN]` hints, and none at all after `\end{document}` |
| `npm run check-solution-layout` | Read-only check that worked solutions follow the *Solution source layout* (blank lines around displays, `\frac` in sentences, `\mathrm` units, no `\!` before `\left`) |
| `npm run check-pack-preamble` | Read-only convention check for Further Maths QBT/Soln shared `pack_preamble.tex` wrappers, `\djsMechanicsPack` and preamble comments, and for the mark schemes' rendered `.tex` wrappers |
| `npm run clean-tex` | Strips full-line comments from QBT/soln bodies and from after `\end{document}`, collapses blank-line runs, re-numbers question delimiters |
| `npm run check-questions [scope]` | Read-only drift detector: reports any QBT/soln pair where the SOLN statement region differs from the QBT statement, plus structurally broken pairs (numbering mismatches, duplicate delimiters, missing/extra `\questionitem`, delimiter numbering gaps). Same scope arg as `compile-tex`. Non-zero exit on drift |
| `npm run sync-questions [scope]` | Rewrites SOLN statement regions in place to match QBT. Solution box content is never touched. Skips structurally broken pairs (run `check-questions` first to triage) |
| `npm run check-resources` | Read-only validator for `src/data/resources.ts` (see Catalogue and database checks). Non-zero exit on any violation |
| `npm run check-generated` | Read-only verifier that the `*.generated.ts` files in `src/data/` match what `count-questions` and `hash-assets` would produce now (catches stale generated state from `--no-verify` commits or hand-edits). Non-zero exit on staleness |
| `npm run check-pairs` | Read-only check that every topic with any pack asset has all four of QBT/soln `.tex`/`.pdf`; that a mark scheme in a section's `ms/` folder has its pack beside it and, once it has a `.tex` or PDF, all three of its `.yaml`, `.tex` and `.pdf`; and that no tracked file under `public/tex` outside `ms/` is missing. Schemes are read from the git index, so unstaged drafts, nested draft files and unstaged scheme deletions don't count |
| `npm run check-markschemes [-- --warnings]` | The mark schemes' guard: read-only, on the schemes and packs as staged (the git index). Rules 1-24 on every committed scheme, then rules 25-27 (see Mark schemes, The guard). Non-zero exit on an error, and on a stale stamp once `STALE_STAMPS` is `'block'` |
| `npm run check-private-terms` | Read-only check that no private term appears in tracked/new files (or, with `--message FILE`, a commit message): text files as they are, PDFs by the text their pages show and the strings they carry. The list comes from `PRIVATE_TERMS` (CI secret), `PRIVATE_TERMS_FILE`, or `~/.config/private-terms.txt`; with none, or an empty one, the check fails. Hits are reported by term number only |
| `npm run mark-checked -- <solutions-id> [--date YYYY-MM-DD]` | Records in `src/data/reviews.json` that a pack's worked solutions were checked: the date (default today, never after it) and the current hash of the pack's `.tex` pair. Run it after the pack's last `.tex` edit. An unknown flag or a second argument is refused, so without the `--` (npm takes `--date` for itself) it stops rather than recording today |
| `npm run mark-checked -- <markscheme-id> [--date YYYY-MM-DD]` | The same for a mark scheme, under its own id: the hash covers the scheme's YAML and the pack's two `.tex` files, so an edit to either shows the scheme as changed. Run it after the scheme's last edit. `--reordered` takes a solutions id only |
| `npm run mark-checked -- <solutions-id> --reordered` | After an edit that only put a pack's questions in a new order, keeps its existing check date and stores the new hash. Refuses unless the committed pack matched its record and both working-tree files are the committed ones with their questions reordered the same way (delimiters, source hints and `\djsLastUpdated` may differ) |
| `npm run review-status [scope \| solutions-id \| markscheme-id]` | Read-only report of packs and mark schemes never checked, checked and unchanged, or changed since their check. Scope as for `check-questions` (default `further-maths`); a solutions or mark scheme id reports that one |
| `npm run compile-tex -- [scope] [--deploy]` | Bulk latexmk over `further-maths` (default) or `all`, packs and mark schemes' rendered `.tex` alike (it compiles a scheme; `markscheme render` writes it); `--deploy` copies built PDFs up beside the source on success. TMUA files are never compiled here (the `tmua` scope is refused) |
| `npm run import-pack -- [flags]` | Adds a pack from a local folder (see Importing a pack) |
| `npm run markscheme -- <command>` | Mark scheme data: read a pack, check, parse, write, format, stamp and renumber a scheme, report each scheme's state, render its pages (see Mark schemes) |
| `npm run markscheme-status [-- <scope> \| <id>]` | `markscheme status`: per scheme in the working tree, the questions broken or stale, and how many packs have no scheme |

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
   (`scripts/lib/resources-write.mjs`) after the section's last pack (after
   that pack's mark scheme row when it has one, so a pack's rows stay
   together), or, for a
   section's first pack, after its strand's last row under a
   `// --- A-level Further Maths: <strand> - <section> ---` line. The rows take
   the existing shape: `id` first; `id`, `file`, `type`, `pairId` and `topic`
   single-quoted; `category` as the constant; `title` double-quoted when it
   holds an apostrophe; `boards` on the questions row only. The file is parsed
   again, and the import fails unless both rows read back with those fields.
5. Runs `count-questions` and `hash-assets`, so the generated files are
   current. The other checks are not run, and can still fail on what was
   imported (an extra `\usepackage`, a solution layout slip): run them, or
   `npm run build`, before committing.

Step 2 also takes the solutions document's statements from the questions
document, as `sync-questions` does, and says which questions that changed:
stripping comments can leave the blank lines around a statement differing
between the two (a statement followed by a commented diagram description
does). A pair whose questions don't line up is refused.

The section folder must match exactly, case included, since the site's paths
are case-sensitive. The importer never creates a section or a section folder:
adding a section to `topics.ts` is a separate site change. Git keeps no empty
folder, so a section with no pack yet has no folder in a fresh clone; make
`public/tex/further-maths/<strand>/<section folder>/` by hand before its
first import, and give `--section`.

If any step after the first write fails, or the run gets SIGINT or SIGTERM
(Ctrl+C), everything written is put back: the documents, the PDFs and their
`build/` output, and the bytes `resources.ts` and the generated files had
before. Each rollback step runs on its own, and the failure that stopped the
import is reported first. Before each write the importer records it in a
journal in the checkout's git folder (`.git/import-pack-journal.json`), so a
run killed outright is put back by the next run before it starts. That puts
`resources.ts` back only if it still holds what the killed run wrote, and
regenerates the generated files. The compile passes latexmk `-f`, as
`compile-tex` does, so an earlier failed or killed compile can't stop a
retry.

## Mark schemes

A pack's mark scheme is `<section>/ms/_QBT___MS__<stem>.yaml`, beside its
`qbt/` and `soln/` (`<stem>` is the questions file's name without `_QBT__`
and `.tex`). The `.tex` and PDF beside it are rendered from it. One YAML
file per pack:

| Level | Field | Rule |
|---|---|---|
| File | `format` | `1` |
| | `pack` | The questions file's header title, exactly as `\djsQbtHeader` writes it (`\&` included) |
| | `last_updated` | `D Month YYYY`, not after today |
| | `questions` | One per `\questionitem`, in order |
| Question | `q`, `stamp` | Its number; its stamp when last drafted, revised or confirmed |
| | `parts` | One per `\marks`, in order |
| Part | `part` | Its label: `""` for a mark on the whole question, `a`, `b.ii`, or `#2` (its place among the question's marks) where the `enumerate` nesting can't be read or two marks would share a label |
| | `rows` | The main method, unless `flag` |
| | `alt` | Optional: `title` (a few words) and `rows`. Only where the worked solution gives a whole-part alternative |
| | `flag` | Draft only: `kind` (`solution_error`, `figure_missing`, `not_drafted`) and a one-line `why`; replaces `rows` and `alt` |
| Row | `scheme` | A literal block (`\|`): each line is a line of the cell, so no `\\` |
| | `figure` | `N`: the Nth counted picture of the question's solution box |
| | `marks` | Up to two on a Scheme row; any number on a figure row, one per feature |
| Mark | `code` | `M1`, `dM1`, `A1`, `A1ft`, `A1 AG`, `B1`, `B1ft`, `E1` |
| | `note` | Required on `M1`, `dM1`, `E1`, `A1ft`, `B1ft` and with `depends_on` |
| | `feature` | Figure marks only: `shape`, `intercepts`, `asymptotes`, `turning points`, `end behaviour`, `symmetry`, `shading`, `labelled point`, `centre and radius`, `half-line` |
| | `depends_on` | `dM1` only, where it doesn't depend on the method mark before it: `"2"` (the second mark of this method) or `"a:2"` (of part `a`'s main method) |
| | `query` | Draft only: `code` (the code it should be) and a one-line `why` |

`part_notes`, `width`, `place` and a `validation` flag are refused. A
question's **stamp** is the first 8 hex characters of an md5 of its statement
(after `\questionitem`, the source hint left out) and its solution box's
body, whitespace collapsed, so a reorder keeps it and any edit changes it.
A **counted picture** is a `tikzpicture` of the solution box not nested in
another (one inside `djsSolutionFigure` counts).

**Canonical form.** `write` and `format` write two-space indents, the fields
in the table's order, every `scheme` a literal block ending in one newline,
and every other string plain where YAML reads it back unchanged,
single-quoted otherwise (`''`, `'#2'`, `'2'`), a literal block if it spans
lines. CRLF reads as LF, and a write keeps the file's line endings. The
checker refuses any other form, so a splice (`write --only`), `stamp` or
`renumber` leaves the rest of the file byte for byte; each refuses a file
not in canonical form.

**The commands** (`npm run markscheme -- <command>`; a `<json>` of `-` is
stdin; exit 0, 1 on errors or a refusal, 2 on a usage error):

| Command | Does |
|---|---|
| `pack <qbt.tex> [--json]` | The pack as a scheme sees it. Without `--json`, one line per `\marks` (label and count) and the totals. With it (`format: 1`): `title` (as the header writes it), `strand` and `section` (as `\djsSitePath` writes them), `files` (`questions`, `solutions`, `scheme`, `conventions`, relative to the site root) and per question `q`, `stamp`, `statement`, `solution` (with a `% figure N` line before each counted picture) and `parts` (`part`, `marks`) |
| `check [<yaml> ... \| <scope>] [--warnings] [--draft]` | Rules 1-24 on scheme files, or on every `ms/*.yaml` under a scope (`further-maths`, the default; `all`; or a folder under `public/tex`). Warnings are counted, and listed with `--warnings`. `--draft` leaves out rule 24, for a draft that still holds flags and queries |
| `check --question <json> --pack <qbt.tex> [--codes <json>] --json` | One question (the data of one `questions` item; `stamp` may be absent), for an external drafting tool's accept: rule 1's fields and types and rules 4-23, with rule 14 when codes are given. Prints `{ ok, errors, warnings }`, each problem `{ rule, where, q, message }` |
| `parse <yaml> [--question N]` | YAML to JSON on stdout, with no rules applied (any YAML file); `--question` picks one question of a scheme |
| `write <json> --to <yaml> [--only "3, 5"]` | JSON to canonical YAML: a whole scheme, or (with `--only`) the named questions, from a scheme, a list of questions or one question, spliced into the existing file. Refuses data with unknown fields or wrong types |
| `format <yaml>` | Rewrites a scheme in canonical form |
| `stamp <yaml> --only "3, 5"` | Sets those questions' `stamp` to their statement and solution now |
| `renumber <yaml>` | After the pack's questions are reordered: matches each question to the pack's by stamp, puts them in the pack's order and sets each `q`. Refuses, naming the question, when a stamp matches none or more than one of the pack's (a question edited in the same change: revise its scheme first) |
| `status [<scope> \| <id>]` | Per scheme, the questions broken (an error of rules 1-24) or stale (stamp no longer matches), and how many packs have no scheme. An id is the pack's questions, solutions or mark scheme id |
| `render [<yaml> ... \| <scope>] [--draft]` | Writes each scheme's `.tex` beside its YAML (see The pages). A scheme with an error of rules 1-24 is named and not rendered; with `--draft` it is checked as a draft (`check --draft`) and its queries and flags are shown. Exit 1 if any scheme was not rendered |

A **codes file** (`--codes`) gives each part's codes in order:
`{ "parts": [{ "q": 3, "part": "a", "codes": ["M1", "A1"], "alt": [...] }] }`,
a bare list of those, or `{ "questions": [{ "q": 3, "parts": [...] }] }`; a
code is a string or an object with a `code`.

**The checker's rules.** Errors fail; warnings (18, 19, 21 and the noted
halves of 6 and 16) are reported.

1. The file parses, holds only the fields above with their types, and is canonical.
2. `pack` is the questions file's header title.
3. `last_updated` is a valid date, not after today.
4. One question per question of the pack, numbered 1, 2, ... in order; one part per `\marks`, in order, with its label.
5. A row has `scheme` or `figure`, not both; a Scheme row has at most two marks.
6. No string holds a tab, form feed, backspace or carriage return (a `\theta`, `\frac`, `\beta` or `\right` written into JSON with one backslash). A line break followed by the rest of a macro starting `\n` (`\neq`, `\nabla`) warns.
7. No empty Scheme line or note; no placeholder (`TODO`, `TBC`, or `...` or `?` alone); no `\\` ending a Scheme line; no `\mathrm{i}` or `\mathrm{e}` in any field: the imaginary unit and the exponential are plain `i` and `e`, as in the packs. No straight `"` in any field, since it prints as a closing quote: their value is `\their{...}` (the scheme preamble's), and quoted words take ` `` ` and `''`.
8. An unflagged part's marks number its `\marks` (an offset `\marks[...]{n}` included).
9. Its `alt`'s marks number the same.
10. Every code is on the list; `A1*`, a lone `AG`, `B2`, `M2`, `R1`, `DM1` and `A0` are refused with the house spelling.
11. In each method (the main rows, and the `alt`'s): every `A` has an `M1` or `dM1` before it; a `dM1` has one before it, or a `depends_on`; `A1 AG` comes at most once, as the method's last `A`.
12. `depends_on` only on a `dM1`, naming an `M1` or `dM1` before it (in its method, or an earlier part's main method), not just the default, and the mark has a note.
13. Every mark of a figure row is a `B1` or `B1ft` with a `feature` from the list; no other mark has one.
14. With `--codes` only: a part's main codes, in order, are those given, and so are its `alt`'s.
15. The required notes are there.
16. Outside maths, no `bod`, `www`, `rot`, `PI`, `BC`, `DR`, `dep`, `indep`, `ACF`, `AWFW`, `NMS` or `CWO`, in any case. Any other word of two to five capitals but `AG`, `SC`, `LHS`, `RHS`, `KE`, `GPE` and `EPE` warns.
17. No `SC` or "special case" anywhere.
18. An `M1`, `dM1` or `E1` note opens with a verb from `NOTE_VERBS` (warning).
19. A note of more than 35 words, maths counting as one, warns.
20. `figure: N` names a counted picture of the question's solution box.
21. A solution box that defines something outside its pictures (`\pgfmathsetmacro`, `\def`, `\newcommand`) warns on each of its figure rows: a picture copied alone may not compile.
22. (Figure scales: not built yet.)
23. A flag has a known kind and a one-line `why`, and no `rows` or `alt`; `check --question` refuses `not_drafted`. A query's code is on the list and differs from its mark's, with a one-line `why`.
24. A committed scheme holds no flag and no query (`check` without `--draft`).

Rules 25-27 are the guard's (below).

**The pages.** `render` writes the `.tex` from the YAML and the pack alone,
so the same data always renders the same bytes (in the file's own line
endings); `compile-tex` builds it. The document, on
`_shared/markscheme_preamble.tex` (the pack preamble, then the scheme's
layer):

- **The front page:** `\djsContentsTitle` with `Mark scheme` and the counts,
  which the renderer sets with `\djsSetQuestionCount` and `\djsAddMarks`
  (a scheme has no `\questionitem` or `\marks`), then the contents table:
  Question, Marks by part (`(a) 4  (b) 6`, empty for one unlabelled part),
  Marks, Page and a total row. A question's name and page number link to
  its first page, which carries the target and a `Question N` bookmark
  (`\msQuestion`). The colophon comes from `\djsLastUpdated{<last_updated>}`.
- **The conventions,** `\input{../../../../_shared/markscheme_conventions.tex}`:
  pages 2 and 3, so the questions start on page 4.
- **A page per question:** one `msscheme` table (Question 16mm, Scheme the
  rest, Marks 16mm, Notes 44mm). Each line of a `scheme` block is a line of
  its cell, 4pt apart. A row's codes share one line (`A1 AG` tied, so only a
  pair too wide stacks); a lone mark's note stands alone, two marks' notes
  each start with their code (`\msNote`). A part's label (`18(a)`,
  `18(b)(ii)`, `18`) sits in its first row, with no rule across the
  Question column inside the part; its total row `[n]` follows (none for a
  question that is one unlabelled part), then `Total for Question N`.
  `\their{...}`, the preamble's, sets a student's value in quotation marks.
- **Page breaks:** a part may break between any two rows. Only its total
  row, the question's total row and an alternative's first row (kept with
  its title) are held to the row above (`\nopagebreak`). A continuation
  page opens `Question N continued` above the repeated head row.
- **An alternative:** a row `\msAlternative{<title>}` across Scheme, Marks
  and Notes, then its rows, all tinted `msTint` in those columns; the
  part's one total row after both.
- **A figure:** the solution box's Nth counted picture (`solutionPictures`
  in the lib: from `\begin{tikzpicture}` to its `\end`, comments and blank
  lines removed), alone on a row across Scheme, Marks and Notes in
  `\msFigure`, which scales it uniformly and only down, to the row's width
  and at most 0.6 of the text height; then one row per feature mark, the
  feature in italics. The picture is drawn with the line width it has in
  the solutions document, so one sized by `\linewidth` keeps its size:
  the preamble measures a solution box's line width at list depths 0 to 3
  (at the packs' text width), and the renderer passes the picture's depth
  (`solutionFigures`' `depths`), as `\msFigure[<depth>]` unless it is a
  part's, one list deep. Without this, tabularray's passes would set the
  cell's `\linewidth` to its measured width and shrink the picture.
- **`--draft`:** a queried mark's code as `\msQueried{B1}{E1}` (B1 → E1?),
  the query's why under its note (`\msQuery`), and a flagged part as one
  row `\msFlag{<kind>}{<why>}` before its total.

The output holds no comments: the YAML's LaTeX is copied as written, except
that a `%` left unescaped in a Scheme line, note, why or title is set as
`\%`, since each lands on one line of the output, where a comment would
swallow the rest of the row. `scripts/lib/fixtures/markscheme/` holds the
golden files: a four-question pack (a sketch with its figure, an
alternative on a question of one unlabelled part, and a part longer than a
page), its scheme, and its rendered `.tex`, plain and draft. After a
deliberate change to the renderer, `UPDATE_GOLDEN=1 npx vitest run
scripts/lib/markscheme-render.test.mjs` rewrites them; compile the fixture
(`latexmk` in its `ms/`, as `compile-tex` runs it) and look at the PDF
before committing. Where `pdflatex` is installed (not in CI), a test
compiles a scheme table and a solution box and checks that a picture's
`\linewidth` is its solution line width on every pass.

**The guard.** `check-markschemes` runs in the pre-commit after
`check-generated`. It reads the git index, not the working tree: the
schemes and the pack files as they are about to be committed (with
`git commit -a` or `git commit <paths>`, the index git builds for that
commit), so an unstaged draft or revision never blocks another commit. On
every scheme in the index it runs rules 1-24, so a committed scheme holds no
flag or query, and then (`scripts/lib/markscheme-guard.mjs`):

25. The committed `.tex` is byte for byte, its line endings read as LF, what `render` writes now.
26. Every `ms/` YAML has its `.tex` and PDF, and every `ms/` file belongs to a pack in its section: `ms/` holds only `_QBT___MS__<stem>.yaml`, `.tex` and `.pdf`, beside `qbt/_QBT__<stem>.tex` and `soln/_QBT___Solns__<stem>.tex`.
27. Every question's stamp matches its statement and solution now.

An error of rules 1-26 blocks the commit. A stale stamp (rule 27) blocks
only when `STALE_STAMPS`, at the top of `scripts/check-markschemes.mjs`, is
`'block'`. It is `'report'` while the schemes are being backfilled: a stale
stamp is listed and the commit goes through. The summary line names the
setting (`stale stamps: report, 3 stale`). Once every pack's scheme is
committed it becomes `'block'`. `--warnings` lists the checker's warnings.
The guard compiles nothing: a scheme's PDF is rebuilt with `compile-tex`
before it is committed, as a pack's is. `npm run markscheme-status` reports
rules 1-24 and stale stamps on the working tree.

**When the guard refuses, or a stamp goes stale:**

| What changed | The remedy |
|---|---|
| A scheme's `.tex`, by hand (rule 25) | Make the edit in the YAML, then `render`; never edit the `.tex` |
| A `\marks` in the pack (rules 4, 8, 9) | Revise the part's scheme in the same commit, then `stamp`, `render` and recompile |
| A question's statement or solution (rule 27) | Look at its scheme, then `stamp <yaml> --only "N"` if it still holds, or revise it |
| A figure a scheme reuses (rules 25, 27) | Re-render and recompile the scheme, look at the figure, then `stamp` |
| The pack's title (rule 2) | Edit `pack` in the YAML to the new header title, then `render` and recompile |
| The renderer (rule 25 on every scheme) | Re-render every scheme (`render further-maths`) in the same commit, `last_updated` unchanged, and recompile them |
| The scheme preamble or the conventions file | Recompile every scheme's PDF (`npm run compile-tex -- further-maths --deploy`), dates unchanged |

## Script module map

| Path | Purpose |
|------|---------|
| `scripts/import-pack.mjs` | Pack import from a local folder: checks, document preparation, compile, `resources.ts` rows, generators; flags for unattended runs |
| `scripts/compile-tex.mjs` | Bulk `latexmk` over `further-maths` or `all` (never TMUA); `--deploy` promotes built PDFs beside source |
| `scripts/check-tex.mjs` | Read-only body-comment hygiene check |
| `scripts/check-solution-layout.mjs` | Read-only *Solution source layout* check over Further Maths soln packs |
| `scripts/check-pack-preamble.mjs` | Read-only Further Maths shared-preamble wrapper convention check |
| `scripts/clean-tex.mjs` | Strips full-line body comments, collapses long blank runs, re-inserts numbered question delimiters |
| `scripts/migrate-pack-preamble.mjs` | Mechanical codemod for migrating Further Maths QBT/Soln files to the shared pack preamble |
| `scripts/migrate-solution-boxes.mjs` | Idempotent codemod converting legacy Solution tcolorboxes in Further Maths SOLN packs to `djsSolution`; `--dry-run`, optional path-substring filters, non-zero exit if a box is skipped. Run it after importing an old-style pack; `import-pack` does not |
| `scripts/check-questions.mjs` | Read-only QBT ⇄ SOLN drift and structural integrity detector |
| `scripts/sync-questions.mjs` | Rewrites SOLN statement regions from QBT while preserving solution boxes and prelude |
| `scripts/check-resources.mjs` | Read-only validator for `src/data/resources.ts` and generated count coverage |
| `scripts/check-generated.mjs` | Read-only byte-match verifier for generated TS files |
| `scripts/check-pairs.mjs` | Read-only QBT/soln `.tex`/`.pdf` quartet and tracked-missing check; mark scheme files from the git index |
| `scripts/check-markschemes.mjs` | The mark schemes' guard (pre-commit): reads the git index (`git ls-files -s`, `git cat-file --batch`) and runs rules 1-27 through `scripts/lib/markscheme-guard.mjs`; `STALE_STAMPS` |
| `scripts/check-private-terms.mjs` | Read-only private-term scan of the tree or a commit message (list kept outside the repo) |
| `scripts/count-questions.mjs` | npm pre-hook generator for `src/data/questionCounts.generated.ts` |
| `scripts/hash-assets.mjs` | npm pre-hook generator for `src/data/fileHashes.generated.ts` |
| `scripts/mark-checked.mjs` | Writes a pack's or a mark scheme's check date and hash to `src/data/reviews.json`; `--reordered` carries a pack's existing check across a pure reorder |
| `scripts/review-status.mjs` | Read-only report of each pack's and mark scheme's check status from `src/data/reviews.json` |
| `scripts/markscheme.mjs` | The mark scheme commands (see Mark schemes): argument parsing, file reads and atomic writes around `scripts/lib/markscheme.mjs` |
| `scripts/lib/markscheme.mjs` | Mark scheme data: the pack reader (`\marks` labels, stamps, counted figures and their list depths, `pack --json`), the YAML reader and canonical writer, the checker's rules 1-24 (`checkScheme`, `checkQuestion`), the splice, stamp and renumber edits, stale stamps (`staleQuestions`), and a solution's pictures for its figures (`solutionPictures`) |
| `scripts/lib/markscheme-guard.mjs` | The guard's rules on paths and text: 26 on the index's file list (`indexSchemes`), and 1-25 and 27 on one scheme with its pack (`guardScheme`) |
| `scripts/lib/markscheme-render.mjs` | The scheme's pages: `renderScheme` writes the `.tex` (front page, conventions input, a table per question; `--draft`'s queries and flags) from a checked scheme and its pack. Golden files in `scripts/lib/fixtures/markscheme/` |
| `scripts/lib/reviews.mjs` | `reviews.json` parse/render/atomic-write, `.tex` pair and mark scheme hashing (CRLF-insensitive, last-updated lines left out) and status classification behind `mark-checked` and `review-status` |
| `scripts/lib/pack-preamble.mjs` | Further Maths pack path/depth helpers, shared-preamble migration, import normalization, initial dates, date validation, pack title and site-path read/write (`readPackIdentity`, `applyPackIdentity`), `\djsMechanicsPack` and preamble comments, and convention checks, the mark scheme wrapper's included (`checkSchemePreambleConvention`) |
| `scripts/lib/pair-presence.mjs` | Pure quartet, mark scheme and tracked-missing checker behind `check-pairs` |
| `scripts/lib/private-terms.mjs` | Pure term-list parsing and whole-token matching behind `check-private-terms` |
| `scripts/lib/pdf-text.mjs` | Pure readable-text extraction from a PDF (page text, document info, bookmarks, metadata) for `check-private-terms` |
| `scripts/lib/tex-utils.mjs` | Shared path, `.tex` discovery, document boundary, and QBT/soln pair helpers; `isSchemeTexFile` for a scheme's rendered `.tex`, apart from `shouldProcessTexFile` |
| `scripts/lib/question-blocks.mjs` | Pure parser/synchronizer for `check-questions` and `sync-questions`; preserves CRLF/LF. `questionOrderChange` recognises a file whose questions were only reordered |
| `scripts/lib/solution-boxes.mjs` | Pure legacy-Solution-box → `djsSolution` rewrite used by `migrate-solution-boxes` |
| `scripts/lib/solution-layout.mjs` | Pure display/paragraph tokenizer and layout rules behind `check-solution-layout` |
| `scripts/lib/site-tree.mjs` | Interactive section-folder picker for `import-pack` |
| `scripts/lib/resources-derive.mjs` | Regex-based introspection of `src/data/resources.ts` (rows, every `id:` key, board lists) and `src/data/topics.ts` (strands, their folders, sections and boards) for the importer and validation; a pack's mark scheme id and file (`markSchemeId`, `markSchemeFile`) |
| `scripts/lib/resources-write.mjs` | Renders a pack's two rows, splices them into `resources.ts` as text and reads them back |
| `scripts/lib/resources-check.mjs` | Pure resource catalogue invariant checker |

## Script conventions

- Pure helpers go in `scripts/lib/` with colocated `*.test.mjs` coverage (the
  root `AGENTS.md`, Tests, has the testing rules).
- Use atomic writes for files consumed by agents or scripts: write to
  `<file>.<rand>.tmp`, then `renameSync`. `reviews.writeReviewsAtomic` is the
  reference pattern.
- Avoid new dependencies without good reason. `yaml`, a devDependency, is the
  mark schemes' parser: YAML 1.2, so `no` and `on` stay strings.
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
  match; each `type: 'answers'` or `type: 'markscheme'` entry has a
  `paperId` naming a `type: 'questions'` entry in its category, at most one
  of each per paper, and no other entry carries `paperId`; a mark scheme's id
  is its pack's solutions id with `-ms` for `-solns`, its title and topic are
  the pack's, its description is `Mark scheme`, its file is
  `<section>/ms/_QBT___MS__<stem>.pdf` beside the pack's
  `qbt/_QBT__<stem>.pdf`, and it carries no `pairId` or `boards` (it takes
  the questions row's); `type: 'questions'` `/qbt/` entries are keyed
  in `questionCounts.generated.ts`; a Further Maths row's `topic` is a section
  of its strand in `topics.ts`, and its `boards` belong to its strand's list;
  each Further Maths QBT/soln entry's `.tex` header topic equals its `title`
  and its `\djsSitePath` names its strand and `topics.ts` section, and so
  do a mark scheme entry's rendered `.tex` (`\djsSchemeHeader`) once it has
  one.
  `orphan-pdf` is currently a warning while the corpus has a known backlog.
- **Generated TS freshness:** `check-generated`. Generated files must
  byte-match what `count-questions` and `hash-assets` would produce now. It
  stays pre-commit-only because `pre*` hooks already run the generators first.
- **Mark schemes:** `check-markschemes`, on the index (see Mark schemes, The
  guard): every committed scheme passes the checker, its `.tex` is what
  `render` writes, its three files sit beside their pack, and its stamps are
  current (reported, or blocking once `STALE_STAMPS` is `'block'`).
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
  `\begin{document}`. A mark scheme's rendered `.tex`
  (`<topic>/ms/_QBT___MS__<stem>.tex`, at the same depth) imports
  `../../../../_shared/markscheme_preamble.tex` and not the pack preamble,
  has one `\djsSchemeHeader{}` and no pack header, the same date, site
  path and comment rules, and no `\djsMechanicsPack` (its conventions
  pages give g).
