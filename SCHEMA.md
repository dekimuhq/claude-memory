# Memory Schema

The store is a flat directory of `.md` files — **one fact per file** — plus an
optional `MEMORY.md` index. Each file has YAML frontmatter and a short body.

```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary — used to decide relevance during recall>
type: user | feedback | project | reference
---

<the fact. For feedback/project, follow with **Why:** and **How to apply:** lines.
Link related memories with [[their-name]].>
```

## Types

| type | what it holds | decays? |
|---|---|---|
| `user` | who the user is — role, expertise, durable preferences | no — stable fact |
| `reference` | pointers to external resources (URLs, dashboards, tickets) | no — stable fact |
| `feedback` | guidance on *how to work* — corrections and confirmed approaches; include the why | **yes** |
| `project` | ongoing work, goals, constraints not derivable from the code/git history | **yes** |

`user` and `reference` are stable facts: they are never flagged, never decay,
and never carry the confidence layer below.

## Writing a memory (capture)

The review engine below only earns its keep if the store stays honest on the way
*in*. Write a memory when something durable changes that a future session needs and
can't re-derive from the code or git history:

- a user preference, or a correction that should not recur → `feedback`
- a decision or constraint with lasting impact, not visible in the code → `project`
- who the user is → `user` · a pointer to an external resource → `reference`

Before you save, four rules keep the pile from rotting:

1. **Dedupe first.** Scan the existing `description:` lines. If one already covers
   the fact, **update that file** — don't add a near-duplicate.
2. **Don't store what's already recorded.** Code structure, past fixes, git history
   are not memories. If asked to "remember" one, capture what was *non-obvious* about
   it, not the fact itself. Skip anything that only matters to the current conversation.
3. **One fact per file.** Name it `<type>_<slug>.md`. For `feedback`/`project`, seed
   `confidence` per the bands below and follow the fact with **Why:** / **How to apply:**
   lines; link related memories with `[[their-slug]]`.
4. **Index it.** Add a one-line pointer to `MEMORY.md` — never the body, never the
   confidence fields.

A good cadence is **session end**: scan for durable facts, dedupe against existing
descriptions, then present them as **one approval batch** (each with its confidence
band + a one-line reason) instead of interrupting mid-task. Writing is human-gated
the same way deletion is.

## Confidence layer (feedback + project only)

`feedback` and `project` memories carry four extra frontmatter fields. Add them
flat, or indented under a `metadata:` block — the parser handles both:

```yaml
confidence: 0.7        # 0.3 tentative · 0.5 moderate · 0.7 strong · 0.9 core
created: 2026-05-29
last_confirmed: 2026-05-29
reaffirm_count: 1
superseded_by: <slug>  # OPTIONAL — set on the loser when a newer memory overtakes it
```

### Confidence bands

Stored confidence stays on four **discrete, human-legible** bands. A human reads
and moves them by hand — the tooling never writes confidence to disk.

| band | meaning |
|---|---|
| `0.3` | tentative — a pattern you noticed, not yet confirmed |
| `0.5` | moderate — stated once, plausibly durable |
| `0.7` | strong — stated as a rule |
| `0.9` | core — a hard "always / never" rule, reaffirmed over time |

### Movement rules (human-applied)

- **New** → `0.5`; `0.7` if stated as a hard rule ("always" / "never" / "from now on");
  `0.3` if you only inferred it from a pattern.
- **Reaffirmed** (recurs, not corrected) → `+0.2` (cap `0.9`); set `last_confirmed` = today;
  `reaffirm_count += 1`.
- **Contradicted** → `−0.2`, or delete if now wrong.
- **Superseded** → set `superseded_by: <winning-slug>` on the loser (don't silently delete).

Confidence is a **discrete banded anchor moved by a human** — never a continuous
score, never auto-written by a background process.

### Time-decay (computed at review time, never persisted)

`review.mjs` computes an *ephemeral* effective confidence for flagging only:

```
effective = stored × survival(age, type)
age       = today − last_confirmed   (whole days)
survival  = exp(−(age / eta)^k)       (Weibull, in (0,1])
```

Decay only **surfaces** an entry for a human to re-confirm (which resets the clock)
or retire. It does **not** lower the stored confidence. `user` / `reference` never decay.
Per-type parameters and their calibration live in `DESIGN.md`.

### Supersession

When a newer memory overtakes an older one on the same subject, set
`superseded_by: <winning-slug>` on the **loser** at write time. The review tool
then surfaces it for human-gated deletion — rather than the old memory silently
lingering or being archived without a trail.

## The index (optional)

A top-level `MEMORY.md` can serve as a one-line-per-entry index loaded into context
each session. Keep it index-only — one line per memory, never the confidence fields,
never the full body. Detail lives in the topic files.
