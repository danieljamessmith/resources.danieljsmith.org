# `data/` — agent hand-off files (tracked, not served)

This directory holds JSON written by one tool and read by another. It lives **outside** `src/` and `public/` on purpose — Astro must not pick it up, and it must not be served as a static asset. Files here **are** committed so that any agent (in any worktree) sees the same state.

## `resources-pending.json`

Staging area between [`scripts/deploy-from-overleaf.mjs`](../scripts/deploy-from-overleaf.mjs) and the (out-of-scope) splicer agent that edits `src/data/resources.ts`.

### Lifecycle

1. **Created / appended** by `deploy-from-overleaf.mjs` after the `.tex` and `.pdf` files have been copied into `public/tex/<sitePath>/{qbt,soln}/` and `clean-tex` has succeeded. One entry per deployed **pair** (questions + solutions). Re-deploying the same topic id prompts to overwrite the pending entry; declining keeps the existing one.
2. **Consumed** by a splicer agent that reads each entry, inserts two `Resource` rows into `src/data/resources.ts` (the questions row immediately before its solutions row, both placed after `siblingId`'s pair), and then clears or archives the consumed entries from this file.
3. **Cleared** to `{ "schemaVersion": 1, "entries": [] }` once all entries are spliced. Keep the file in place (don't delete it) so the deploy script can append future entries without re-creating it.

### Schema (v1)

```jsonc
{
  "schemaVersion": 1,
  "entries": [
    {
      "addedAt": "2026-04-18T14:23:11Z",       // ISO timestamp written by the deploy script
      "status": "pending",                     // reserved for splicer to flip if needed
      "sitePath": "further-maths/core-pure/vectors",
      "topicName": "Matrix Determinants & Inverses",
      "id": "fm-vectors-matrix-determinants-inverses",
      "category": "FM - Core Pure",
      "topic": "Vectors",
      "qbtFile": "/tex/further-maths/core-pure/vectors/qbt/_QBT__Matrix_Determinants___Inverses.pdf",
      "solnFile": "/tex/further-maths/core-pure/vectors/soln/_QBT___Solns__Matrix_Determinants___Inverses.pdf",
      "boards": ["edexcel", "aqa", "ocr-a"],   // null = all boards
      "overleafProjectIds": {
        "qbt": "<hex>",                         // first-cloned project id
        "soln": null                            // null for unified one-project deploys; populated only when the legacy two-project fallback fired
      },
      "siblingId": "fm-vectors-vector-product-solns", // splicer inserts the new pair after this id
      "note": null,
      "comments": ""
    }
  ]
}
```

### Invariants

- **Atomic write**: the deploy script writes to `<file>.<rand>.tmp` then `renameSync`s — never partial JSON on disk.
- **Dedup by `id`**: each `id` appears at most once. Re-deploys overwrite the existing entry (with confirmation in the deploy script's prompt).
- **No secrets**: never put OAuth tokens, the Overleaf git token, or anything else sensitive into entries here.
