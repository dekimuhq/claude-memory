# Design — time-decay + structured supersession

This documents *why* the memory engine works the way it does, and — just as
importantly — what it deliberately does **not** do.

## Problem

A naive file-based agent memory has two gaps versus a real memory model:

1. **No time-based decay.** A memory's confidence only moves when a human acts on
   it. An entry confirmed once and never revisited stays at full confidence
   forever. Treating staleness as a flat day-count ignores how *strong* the memory
   was — a core fact and a tentative guess go stale on the same day.
2. **No structured supersession.** When a newer memory overtakes an old one, the
   old one is silently archived or deleted. Nothing on the loser points at the
   winner, so a review tool can't surface "this was overtaken — confirm the delete."

This engine solves both while keeping the store a plain flat directory of markdown
files. No database, no embeddings, no continuous scoring.

## Decisions

### 1. Decay is computed at review time, never written to files

Stored `confidence` remains the human-set banded anchor. The review script computes
an **ephemeral effective confidence**:

```
effective = stored × survival(age, type)
age       = today − last_confirmed   (whole days)
survival  = exp(−(age / eta)^k)       (Weibull, in (0,1])
```

`effective` is used **only for flagging** and is never persisted. This keeps the
hard rule — *"confidence movement is human-applied, never a background process"* —
intact while adding an automatable surfacing layer on top.

### 2. Per-type Weibull parameters (k = 1.5)

| type | k | eta | flags a 0.5 entry at | flags a 0.9 entry at |
|---|---|---|---|---|
| `project` | 1.5 | 47 | ~30 d | ~50 d |
| `feedback` | 1.5 | 280 | ~180 d | ~300 d |

`user` / `reference` are absent from the map and never decay.

**Calibration.** An entry is flagged when `effective ≤ 0.3` (the flag floor).
Solving `0.5 · exp(−(age/eta)^1.5) = 0.3` gives `(age/eta)^1.5 = −ln(0.6) = 0.511`,
i.e. `age/eta = 0.642`. Fixing the crossing for a *moderate* (0.5) entry at the
intended thresholds gives `eta_project = 30/0.642 ≈ 47` and
`eta_feedback = 180/0.642 ≈ 280`. So a moderate entry flags at exactly those
day-counts, while `k = 1.5` (super-linear: trustworthy for a while, then degrades)
grades the window by stored confidence — core facts resist longer, tentative ones
surface sooner. `project` decays faster than `feedback` because project state goes
stale quickly; working preferences are stickier.

Treat the parameters as a first calibration. Tune `eta` per type if core facts flag
too early or tentative ones linger too long; `k` controls how sharply the curve
grades by confidence.

### 3. `decayed` replaces flat staleness

Per-type decay *is* the principled staleness signal, so a flat day-count is retired.
Flag groups:

- **decayed** — `effective ≤ 0.3` **and** stored `> 0.3` (decay is the cause).
- **lowConfidence** — stored `≤ 0.3` (born low; kept separate so the human sees
  *re-confirm* vs *reconsider*). Never double-flagged as decayed.
- **superseded** — entry carries a `superseded_by` field.
- **needsBackfill** — feedback/project file missing the confidence fields.

### 4. `superseded_by: <slug>` — structured supersession

An optional frontmatter field on the *loser*, pointing at the winner's `name` slug.
Set at memory-write time when a new memory overtakes an old one — written exactly
where a silent archive/delete used to happen, by the agent noticing the conflict,
not by a similarity engine. The flagger surfaces it; the human gates the delete.

## What this engine deliberately does NOT do

- **Continuous Bayesian reaffirm** (e.g. `conf += (1−conf)·w·0.3`). Rejected — stored
  confidence stays on discrete human-legible bands `{0.3, 0.5, 0.7, 0.9}`. A human
  reads and acts on these; continuous drift would obscure that. Diminishing returns
  already live in the `0.9` band cap.
- **Auto-writing decayed confidence to disk.** Rejected — the hard rule is
  *"confidence movement is human-applied."* Auto-decay would violate that and the
  never-auto-delete principle.
- **SQLite store / embedding clustering / LLM "mental-model" compression.** Out of
  scope — overkill for a few-hundred-file flat store. The headline "compress a
  session into a mental model" is just an LLM summarization step.

## Provenance

The time-decay and supersession ideas were drawn — reimplemented inward, not
copied — from the `weibull` and `veracity-consolidation` modules of the open
`mnemopi` / oh-my-pi work. Credit where due; the design choices above (discrete
bands, no auto-write, flat-file store) are this project's own.
