# AGENTS.md — resources.danieljsmith.org

Agent onboarding document. Read this file before working in this repository.

---

## Project overview

Dual-purpose repository:

- **Astro static site** (`src/`) — a resource-listing website built with Astro, Tailwind CSS, and TypeScript, deployed as a static site.
- **LaTeX question bank** (`tex/`) — A-level Further Maths question-by-topic (QBT) papers and solutions, compiled to PDF with latexmk.

---

## Project structure


| Path                    | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `src/`                   | Astro site source (components, pages, layouts, styles)           |
| `src/pages/further-maths/` | Further Maths routes: landing (`index.astro`), Core Pure, Further Mechanics |
| `src/scripts/`         | Client-side modules imported by pages (e.g. `board-filter.ts` for FM section pages) |
| `public/tex/`            | LaTeX source files and deployed PDFs, co-located by topic        |
| `public/tex/**/build/`   | latexmk output — PDF and `.synctex.gz` files (gitignored staging)|
| `public/tex/**/build/aux/` | latexmk auxiliary files (`.aux`, `.log`, `.fls`, etc.)         |
| `public/`                | Static assets served as-is by Astro                              |
| `.vscode/settings.json`  | Workspace settings including latexmk build args                  |

Further Maths on the site uses three routes: `/further-maths` (strand picker), `/further-maths/core-pure`, and `/further-maths/further-mechanics`. In `src/data/resources.ts`, strand categories are named **`FM - Core Pure`** and **`FM - Further Mechanics`**; helpers that aggregate across strands match the prefix `FM - `.

### LaTeX directory layout

```
public/tex/
  further-maths/
    core-pure/
      differential-equations/
        qbt/
          _QBT__<Topic>.tex           ← question paper (source, tracked)
          _QBT__<Topic>.pdf           ← deployed PDF (tracked)
          build/                      ← gitignored staging area
            _QBT__<Topic>.pdf         ← compiled output; review then copy up
            aux/
        soln/
          _QBT___Solns__<Topic>.tex   ← solutions (source, tracked)
          _QBT___Solns__<Topic>.pdf   ← deployed PDF (tracked)
          build/
            _QBT___Solns__<Topic>.pdf
            aux/
    further-mechanics/
      <topic-slug>/
        qbt/
        soln/
          (same qbt/soln + build pattern as core-pure)
```

---

## LaTeX workflow

### File naming conventions


| Pattern                     | Meaning                    |
| --------------------------- | -------------------------- |
| `_QBT__<Topic>.tex`         | Question paper for a topic |
| `_QBT___Solns__<Topic>.tex` | Solution sheet for a topic |


### `\marks` custom command

`\marks[offset]{n}` places a margin note with the mark count `n`.

- `offset` (optional, e.g. `-20pt`) shifts the note vertically — use when the default position overlaps text.
- **Never** place `\\` immediately after `\marks` when it is the last item before `\end{enumerate}` or before the next `\item`. This produces a "no line here to end" error.

```latex
% ✅ GOOD
\item Find the general solution. \marks{3}

% ❌ BAD — spurious \\ causes "no line here to end"
\item Find the general solution. \marks{3} \\
```

### Common error patterns


| Error message                                   | Likely cause                                   |
| ----------------------------------------------- | ---------------------------------------------- |
| `! LaTeX Error: \begin{...} ended by \end{...}` | Mismatched environment                         |
| `! Missing $ inserted` / unclosed `$`           | Unmatched math delimiter                       |
| `! Missing \right.`                             | `\left` without matching `\right`              |
| `No line here to end`                           | Spurious `\\` after `\marks` or at end of list |
| `Undefined control sequence`                    | Misspelled or missing `\usepackage`            |


### Autonomous error-fix loop

Use this loop whenever you need to fix build errors in a `.tex` file. **Never read the entire file** — always target only the lines around the reported error.

```
1. ReadLints on the .tex file → get error message + line number
2. Read ±10 lines around the error line
   ⚠ LaTeX error lines are often off by 1–2 lines. The reported line is
     frequently the symptom, not the source. Always consider adjacent lines.
3. StrReplace → apply the minimal fix
4. Shell: rebuild with latexmk (synchronous — block until complete):

   latexmk -f -pdf -cd -interaction=nonstopmode -synctex=1 -file-line-error \
     -auxdir=<outdir>/aux -outdir=<outdir> <texfile>

   where <outdir> = the sibling "build" directory next to the .tex file.
   Example: public/tex/further-maths/core-pure/differential-equations/qbt/build

5. ReadLints again → confirm no [ERROR] entries remain
   • If errors remain, return to step 2 for the next error
   • "Rerun" warnings ("Label(s) may have changed") are NOT errors — ignore
```

> **Why shell rebuild, not cache deletion?** Running latexmk directly is synchronous and deterministic. Deleting `.fdb_latexmk` and relying on LaTeX Workshop autobuild introduces a timing gap — ReadLints may return stale results if checked before the background build finishes. The `-f` flag forces latexmk to rebuild even if it thinks outputs are up-to-date.

---

## Web workflow

- **Framework:** Astro with TypeScript
- **Styling:** Tailwind CSS (`tailwind.config.mjs`)
- **Config:** `astro.config.mjs`
- Follow standard Astro and Tailwind conventions. No custom web-specific agent rules.

---

## Tooling


| Tool            | Notes                                               |
| --------------- | --------------------------------------------------- |
| Shell           | PowerShell (`pwsh`)                                 |
| LaTeX build     | `latexmk` — args defined in `.vscode/settings.json` |
| Linting         | ChkTeX (enabled on edit via LaTeX Workshop)         |
| Package manager | npm                                                 |


### latexmk args (from `.vscode/settings.json`)

```
-pdf -cd -interaction=nonstopmode -synctex=1 -file-line-error
-auxdir=<OUTDIR>/aux -outdir=<OUTDIR> <DOCFILE>
```

Add `-f` when running from the shell to force a rebuild.

---

## Cursor rules


| Rule file                      | Trigger        | Purpose                                                                |
| ------------------------------ | -------------- | ---------------------------------------------------------------------- |
| `.cursor/rules/onboarding.mdc` | Always applied | Points agents to this file; key orientation facts                      |
| `.cursor/rules/latex.mdc`      | Always applied | Autonomous error-fix loop, build layout, `\marks` rules, common errors |


