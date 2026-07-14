# claude-memory

**File-based memory for Claude Code that decays.** Stale facts surface themselves
for review instead of rotting silently — and nothing is ever auto-deleted.

A few hundred lines of zero-dependency Node, a drop-in skill, and a SessionStart
hook. No database, no embeddings, no background process touching your files.

---

## The problem

Most agent "memory" is an append-only pile. A fact you confirmed once lives forever
at full confidence. Staleness, if it's handled at all, is a flat day-count that
treats a core rule and an offhand guess the same — both "expire" on the same day.
So the store fills with half-true, never-revisited claims, and you stop trusting it.

## The idea

Each memory carries a **human-set confidence band** — `0.3` tentative, `0.5`
moderate, `0.7` strong, `0.9` core. A **per-type Weibull survival curve** decays
that confidence *over time since it was last confirmed*:

```
effective = stored × exp(−(age / eta)^k)
```

The decayed value is computed **at review time and never written to disk**. A core
fact resists for months; a tentative one surfaces in weeks. When `effective` drops
below the flag floor, the entry shows up in a review — and a human decides: confirm
(resets the clock), demote, edit, or delete. The tooling flags; **the human always
moves the confidence and gates every deletion.**

Plus structured **supersession**: when a newer memory overtakes an old one, the old
one gets a `superseded_by: <slug>` pointer instead of vanishing — so the review tool
can say "this was overtaken, confirm the delete" with a trail.

See [DESIGN.md](DESIGN.md) for the calibration math, the choices we deliberately
rejected (continuous Bayesian scoring, SQLite, embeddings, auto-write), and one we
field-tested and retired — a cross-session recurrence ledger that died of
never-being-fed.

## Quickstart

```bash
# 1. point at your memory directory
export MEMORY_DIR="$HOME/.claude/memory"     # a dir of one-fact-per-file .md notes

# 2. first run — add confidence fields to existing feedback/project notes
node skill/scripts/backfill.mjs              # dry-run, shows what would change
node skill/scripts/backfill.mjs --apply      # write them

# 3. flag what needs review
node skill/scripts/review.mjs
```

Example output:

```
## decayed (2)
  - project_old_migration.md [project, conf 0.5] — 41d → eff 0.28
  - feedback_some_pref.md [feedback, conf 0.5] — 190d → eff 0.29

## lowConfidence (1)
  - feedback_hunch.md [feedback, conf 0.3]

## superseded (1)
  - feedback_old_rule.md [feedback, conf 0.7] — superseded_by new-rule-slug

## needsBackfill (0)
```

### Install as a Claude Code skill

```bash
./install.sh        # copies skill/ → ~/.claude/skills/memory-review, prints the rest
```

Then add the memory conventions block (printed by the installer) to your
`~/.claude/CLAUDE.md`, and wire the SessionStart hook from `hooks/session-nudge.mjs`
into `settings.json`. The hook is silent on a clean store and nudges Claude to run
the review when anything is flagged — zero token cost when there's nothing to do.

## How it fits together

| Piece | Role |
|---|---|
| `skill/scripts/lib.mjs` | the engine — `survival()`, `effectiveConfidence()`, frontmatter parse. Zero deps. |
| `skill/scripts/review.mjs` | read-only flagger → `decayed` / `lowConfidence` / `superseded` / `needsBackfill`. |
| `skill/scripts/backfill.mjs` | one-time migration adding the confidence fields. |
| `skill/SKILL.md` | the read-flag-act loop Claude follows. |
| `hooks/session-nudge.mjs` | SessionStart nudge; silent when clean. |
| [SCHEMA.md](SCHEMA.md) | the frontmatter contract + capture rules + confidence bands + movement rules. |
| [DESIGN.md](DESIGN.md) | why it works this way; what it rejects. |

## The memory file format

One fact per `.md` file with YAML frontmatter. Full contract in [SCHEMA.md](SCHEMA.md):

```markdown
---
name: prefer-short-replies
description: user prefers terse answers, no preamble
type: feedback
confidence: 0.7
created: 2026-05-01
last_confirmed: 2026-05-20
reaffirm_count: 2
---

Keep replies short; lead with the answer.
```

Only `feedback` and `project` memories decay. `user` and `reference` are stable
facts — never flagged, never migrated.

The decay engine only stays useful if the store is honest on the way *in*: one fact
per file, dedupe against existing `description:` lines before writing, never store
what git/code already records, and capture durable facts as one approval batch at
session end. Those capture rules live in [SCHEMA.md § Writing a memory](SCHEMA.md).

## Run the tests

```bash
npm test      # node --test, zero dependencies
```

## License

MIT — see [LICENSE](LICENSE). Built by [Dekimu](https://dekimu.com).
