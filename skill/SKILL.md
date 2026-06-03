---
name: memory-review
description: |
  On-demand review of a file-based memory store. Flags stale (time-decayed),
  low-confidence, and superseded feedback/project memories for human-gated
  action — confirm, demote, delete, or edit. Never auto-deletes. Runs the
  one-time backfill on first use. Use when asked to "memory review",
  "review memory", "prune memory", or "what memories are stale".
---

# Memory Review

Read-flag-act loop over a file-based memory store — one fact per `.md` file with
YAML frontmatter (see `SCHEMA.md` in the repo root). Set `MEMORY_DIR` to your
memory directory, or pass the path as the first argument to each script. Scripts
live in `scripts/` beside this file. **Nothing is auto-deleted — every
destructive action needs an explicit per-entry choice from the user.**

Confidence + staleness apply to `feedback` and `project` memories only.
`user` / `reference` are stable facts and are never flagged or migrated.

## Step 0 — Backfill check (first run only)

    node scripts/review.mjs --json     # MEMORY_DIR set, or: node scripts/review.mjs /path/to/memory --json

If `needsBackfill` is non-empty, the four confidence fields haven't been added yet:
1. Dry-run: `node scripts/backfill.mjs`
2. Show the user the count and a sample of "would migrate" lines.
3. On approval: `node scripts/backfill.mjs --apply`
4. Show before/after `head -12` of one flat and one nested file as proof.

Note: `created` / `last_confirmed` seed from each file's git-add date (or today
if the store isn't git-tracked). They start accumulating real meaning from the
first review onward.

## Step 1 — Flag

    node scripts/review.mjs

Four groups:
- **decayed** — stored confidence was once above the 0.3 floor but its *time-decayed*
  effective confidence (`stored × Weibull-survival(age, type)`) has fallen to/below it.
  A core (0.9) fact resists decay far longer than a moderate (0.5) one at the same age.
  Row shows `age → eff`.
- **lowConfidence** — a human deliberately set it ≤ 0.3 to begin with (born-low, not decayed).
- **superseded** — the entry carries a `superseded_by: <slug>` field (Step 2).
- **needsBackfill** — should be empty after Step 0.

Decay never touches the files — `effective` is computed at review time only. Stored
`confidence` stays the human-set banded anchor; decay just surfaces the entry for a human
to re-confirm or retire. Params + calibration live in `DESIGN.md`.

## Step 2 — Supersession cross-check

`superseded_by` is set **at memory-write time**, not by the script: when a new memory
overtakes an old one on the same subject, add `superseded_by: <new-slug>` to the loser's
frontmatter instead of silently deleting it. The flagger then surfaces it here for
human-gated cleanup.

For decayed / low-confidence entries with no field yet, still check for an overtaking rule
(e.g. a contradicting commit or a newer note on the same topic). On a match, set
`superseded_by` on the loser, then propose deletion in Step 4.

## Step 3 — Present the flagged list

One grouped table — Decayed · Low-confidence · Superseded — each row:
name, type, stored confidence, age, effective confidence (decayed) or the
superseding slug (superseded).

## Step 4 — Act per entry (user chooses)

| Choice | Edit to make |
|---|---|
| **Confirm** | `last_confirmed` = today; `reaffirm_count` += 1; optionally raise confidence one band. Resets the decay clock — the entry drops out of `decayed` until age accrues again. |
| **Demote** | Lower `confidence` one band (0.9 → 0.7 → 0.5 → 0.3). |
| **Delete** | Remove the topic file AND its one-line entry in any index file. |
| **Edit** | Open for manual correction, then Confirm. |

A `decayed` entry just needs **Confirm** if it's still true (re-confirming pushes the flag
out), or **Delete** if time proved it irrelevant. A `superseded` entry is normally **Delete**
(the winner already holds the truth) — verify the winning slug exists first.

Apply edits directly on the file's frontmatter, matching its existing style (flat keys,
or indented under `metadata:`).

## Confidence bands

`0.3` tentative · `0.5` moderate · `0.7` strong · `0.9` core. Stored confidence
stays on these discrete bands (human-legible); **decay does not move it** — it only
lowers the ephemeral *effective* confidence used for flagging. Full movement rules
(new / reaffirmed / contradicted / superseded / decayed) live in `SCHEMA.md`.
