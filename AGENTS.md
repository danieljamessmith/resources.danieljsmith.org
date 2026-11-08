# AGENTS.md - resources.danieljsmith.org

Read this file before working in this repository.

`AGENTS.md` is the one instruction file for agents here; durable rules go
in it, not in editor-specific rule folders. `src/README.md` describes the
site's presentation, and is read before changing anything under `src/`.

## Public repository

This repository is public. Never name or path-reference other local repositories or private tooling in files, comments, tests or commit messages, and never say how a document was made; leave them out. `check-private-terms` enforces this, in text files and PDFs, against a term list kept outside the repo, in the commit hooks, and fails where there is no list.

---

## Project overview

A static resource-listing site built with Astro, Tailwind CSS and TypeScript, deployed to GitHub Pages. It serves PDFs and lists them:

- **Pages** (`src/`): the home page, the two Further Maths strand pages, the TMUA listing and a viewer page per document. They are edited by hand here.
- **PDFs** (`public/tex/`): A-level Further Maths question-by-topic (QBT) packs, their worked solutions and mark schemes, two notes documents, and TMUA papers with answer keys and worked solutions. They are committed finished; the site builds no LaTeX, and CI never runs it.
- **Rows** (`src/data/resources.json`): one row per PDF, which the pages list.
- **Question counts** (`src/data/question-counts.json`): the questions in each questions PDF.

Do not edit the PDFs, the rows or the counts here unless the maintainer asks. The board and section catalogue (`topics.json`, `exam-boards.json`) is edited here.

---

## Project structure

| Path | Purpose |
|------|---------|
| `src/` | Astro site source (components, pages, layouts, styles) |
| `src/pages/further-maths/` | Further Maths routes: legacy redirect (`index.astro`), `core-pure.astro`, `further-mechanics.astro` |
| `src/pages/tmua.astro`, `src/pages/view/[id].astro` | TMUA landing + per-document viewer |
| `src/pages/source/[id].astro` | Redirect pages: each old `/source/<id>/` address sends the reader to `/view/<id>/` (see Redirects) |
| `src/data/resources.json` | The rows (see Rows) |
| `src/data/resources.ts` | Reads the rows, adds each PDF's hash, download name and question count, and holds the catalogue helpers (`getPaperFamily`, `familyInOrder`, the TMUA stats) |
| `src/data/resources.test.ts` | The rows test (see Tests) |
| `src/data/question-counts.json` | Questions per questions PDF, keyed by its `/tex/...` path, in path order |
| `src/data/topics.json`, `src/data/topics.ts` | Further Maths strands: each strand's sections (id, topic, title, nav label) in page order, its boards key and its filter storage key; also drives the viewer's back-to-topic links |
| `src/data/exam-boards.json` | The exam board reference: per strand (keyed by its folder, `core-pure` or `further-mechanics`), which code it shows (`qualification` or `paper`) and its boards in menu order, each with its label, awarding body, qualification code and name, and in Further Mechanics its paper code and name. `checked` is the date the codes were last checked against the boards' own documents. Read by `src/data/examBoards.ts` (the board menu and pills) |
| `src/data/resourceContents.ts` | Per-question contents lists (topic + one-line summary) shown as crawlable text below the viewer, keyed by resource id. Hand-written |
| `src/data/source-redirects.json` | The fixed list of ids that once had a `/source/<id>/` page |
| `src/data/fileHashes.ts` | PDF hashes for cache-busting, written by `scripts/hash-assets.mjs` (npm pre-hook); never hand-edited |
| `src/scripts/` | Client-side modules imported by pages (`board-filter.ts`, `viewer.ts`) |
| `public/tex/` | The deployed PDFs (see File names) |
| `scripts/hash-assets.mjs` | Hashes every PDF under `public/tex/` into `fileHashes.ts` |
| `scripts/check-private-terms.mjs`, `scripts/lib/` | The private-terms check, and the PDF text reader it uses |
| `og-images/` | Source for link-preview images: TikZ diagram plus `build_tmua.py`, which writes `public/og/tmua.png` (Python + Pillow, run by hand; not part of the build) |
| `.husky/pre-commit`, `.husky/commit-msg` | Pre-commit runs `npx vitest run` and `check-private-terms`; commit-msg runs `check-private-terms` on the message |

Pages, layouts, styles, mobile behaviour and search metadata (including the rule that internal links end in `/`) are described in `src/README.md`: read it before changing anything under `src/` outside `src/data/`. Strand categories are named **`FM - Core Pure`** and **`FM - Further Mechanics`** (constants `FM_CP`, `FM_MECH` in `resources.ts`); helpers that aggregate across strands match the prefix `FM - ` (`FM_PREFIX`).

---

## Rows

`resources.json` holds one row per PDF, with the fields of `Resource` in `resources.ts`: `id`, `title`, `description`, `file` (its `/tex/...` path), `category` (a strand's category or `TMUA`), `type`, and as needed `pairId`, `paperId`, `topic`, `boards`, `note`, and `order`.

- **Order:** `order` is the row's teaching position within its topic section (TMUA: within its category). A paper's answer key, mark scheme and solutions take its value and follow it in the file. Pages list rows by `inTeachingOrder`.
- **A Further Maths pack** has two or three rows: `questions` (with `pairId` naming its solutions, and `boards`), `solutions` (with `pairId` back), and, if it has one, its mark scheme.
- **Mark scheme rows:** `type: 'markscheme'`, after the pack's solutions row, with `paperId` naming the pack's questions row; its id is the solutions id with `-ms` for `-solns`; its title and topic are the pack's; its description is `'Mark scheme'`; its file is `<section>/ms/_QBT___MS__<stem>.pdf`; it has no `pairId` or `boards` (the questions row's boards apply). `getPaperFamily` finds all three rows from any one of them, the strand page and the viewer list Questions | Mark scheme | Solutions, side by side pairs the scheme with its questions, and the download is named `<Title> - Mark Scheme.pdf`.
- **TMUA papers** have up to three rows, in this order: `type: 'questions'` (with `pairId` once it has solutions), `type: 'answers'` with `paperId` naming the paper, and `type: 'solutions'`. Their descriptions are written by hand. The TMUA listing and the viewer link them in that order; side by side pairs the questions with the solutions, and an answer key with its paper.
- **Notes** rows are `type: 'notes'`.
- **Boards:** only `questions` and `notes` rows carry `boards`; omitted means all boards. The pills under a pack show board labels only, never codes, and none for a pack for all boards. A `cie-9231` tag means the content is examined in 9231, or assumed by 9231 and examined in 9709 at the pack's depth.

The PDFs print catalogue data: a pack's front page shows its strand and section titles from `topics.json` and its boards' codes from `exam-boards.json`. A change to either file that touches a published pack leaves that pack's PDFs out of date until they are replaced; tell the maintainer which packs it touches.

An exam board's code or label changes, or a board is added: edit `src/data/exam-boards.json` (and the `ExamBoard` ids in `src/data/examBoards.ts` for a new id), and set its `checked` date when the codes were checked against the boards' documents.

### File names

These paths are public URLs and never move:

| Path | Document |
|------|----------|
| `/tex/further-maths/<strand>/<section>/qbt/_QBT__<Stem>.pdf` | A pack's questions |
| `/tex/further-maths/<strand>/<section>/soln/_QBT___Solns__<Stem>.pdf` | Its worked solutions |
| `/tex/further-maths/<strand>/<section>/ms/_QBT___MS__<Stem>.pdf` | Its mark scheme |
| `/tex/further-maths/<strand>/<section>/notes/_Notes__<Title>.pdf` | Notes |
| `/tex/tmua/TMUA_Set<X>_Paper<N>{,_Answers,_Solutions}.pdf` | A TMUA paper, its answer key, its worked solutions |

`<Stem>` is the pack's title with every non-alphanumeric character replaced by an underscore, as first published; it stays when a title changes. Section folders are not always the section ids in `topics.json` (`induction` holds `proof-by-induction`). Nor do the page URLs move: `/view/<id>/`, the strand pages' topic anchors (`/further-maths/<strand>/#<section id>`), `/tmua/` and `/og/tmua.png`.

### Redirects

The site once had a LaTeX source page per document at `/source/<id>/`. Each of those addresses is now a redirect page to `/view/<id>/`, built from the fixed list in `src/data/source-redirects.json`; it holds the refresh, `noindex` and the canonical. The sitemap leaves `/source/` out. Never add to the list or remove from it.

---

## LaTeX sources still here

A few LaTeX sources are still committed under `public/tex/`, so they deploy with the PDFs:

- Simple Harmonic Motion's four, in `public/tex/further-maths/further-mechanics/circular-motion-oscillations/`: `qbt/_QBT__Simple_Harmonic_Motion.tex`, `soln/_QBT___Solns__Simple_Harmonic_Motion.tex`, and the mark scheme's `ms/_QBT___MS__Simple_Harmonic_Motion.tex` and `ms/_QBT___MS__Simple_Harmonic_Motion.yaml`;
- the 18 TMUA `.tex`, one beside each PDF in `public/tex/tmua/`;
- the five files in `public/tex/_shared/` that those load.

Nothing here builds them. Leave them as they are unless the maintainer asks. While any `.tex` remains under `public/`, `public/robots.txt` keeps `Disallow: /*.tex$`; remove that line only with the last of them.

---

## Astro dev / build / check

```pwsh
npm run dev      # astro dev
npm run build    # astro build
npm run check    # astro check
```

Each has an npm `pre*` hook that runs `node scripts/hash-assets.mjs`, which hashes every PDF under `public/tex/` and writes `src/data/fileHashes.ts`. The build needs no LaTeX source.

---

## Tooling

| Tool | Notes |
|------|-------|
| Shell | PowerShell (`pwsh`). Chain with `;` not `&&`. Use `Select-Object -First N` not `head`, `Select-String` not `grep` (or use `rg`). |
| Package manager | npm (Node ≥ 26). `npm ci` installs the Husky hooks |
| Test runner | Vitest (`npm test` → `vitest run`) |
| Pre-commit | Husky → `npx vitest run` (the rows test included), then `check-private-terms`. The `commit-msg` hook runs `check-private-terms` on the message |
| Private terms | `check-private-terms` reads its list from `PRIVATE_TERMS`, then the file `PRIVATE_TERMS_FILE` names, then `~/.config/private-terms.txt`, and fails with none. It scans every tracked or new file: text whole, PDFs by their page text, metadata and bookmarks |
| CI | On every branch but `main`: `npm ci`, `npm test`, `npm run check`, `npm run build`. Deploy, on `main`, runs the same, then publishes `dist/` to GitHub Pages |

### Tests

Vitest runs every `*.test.ts` and `*.test.mjs`:

- `src/data/resources.test.ts`, the rows test: the data files are in their one written form; every row is well formed, has its own id and names a PDF that is there, and every deployed PDF has a row; pairs and papers point both ways; mark scheme rows follow their pack; every Further Maths row sits in a section of its strand, with its strand's boards; the file is in teaching order; and the question counts cover the questions rows and nothing else.
- `src/data/sourceRedirects.test.ts`: the redirect list is sorted, has each id once, and every id is a row.
- `src/data/examBoards.test.ts`, `src/scripts/viewer.test.ts`: the board reference and the viewer's layout logic.
- `scripts/hash-assets.test.mjs`, `scripts/lib/*.test.mjs`: the PDF hashes, the term matching and the PDF text reader.

When adding a pure helper to a tested module, add a test case beside it. Do not modify existing test assertions without explicit user approval.
