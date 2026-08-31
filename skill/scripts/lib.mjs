// Shared helpers for the memory-review scripts. Zero dependencies.

/** Extract the frontmatter block (text between the first two `---` lines). */
export function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : '';
}

/**
 * Parse a memory file's frontmatter. Matches BOTH flat and nested (metadata:)
 * styles — every field regex is anchored to line start with optional indent.
 */
export function parseMemo(src) {
  const fm = frontmatter(src);
  const grab = (key) => {
    const m = fm.match(new RegExp(`^\\s*${key}:\\s*(\\S.*?)\\s*$`, 'm'));
    return m ? m[1] : null;
  };
  const confRaw = grab('confidence');
  return {
    type: grab('type'),
    confidence: confRaw === null ? null : Number(confRaw),
    created: grab('created'),
    last_confirmed: grab('last_confirmed'),
    superseded_by: grab('superseded_by'),
    hasConfidence: confRaw !== null,
  };
}

/** Whole-day difference between two ISO `YYYY-MM-DD` dates (to − from). */
export function ageInDays(fromISO, toISO) {
  const MS = 86_400_000;
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / MS);
}

/**
 * Per-type Weibull decay parameters. `user` / `reference` never decay — they are
 * stable facts and are absent here on purpose. Calibrated (k=1.5) so a *moderate*
 * (0.5) entry's effective confidence crosses the 0.3 flag floor at the legacy
 * staleness thresholds (project ≈ 30d, feedback ≈ 180d); a *core* (0.9) entry
 * crosses later (~50d / ~300d) and a *tentative* one sooner. Rationale + the
 * calibration arithmetic live in DESIGN.md.
 */
export const DECAY = {
  project: { k: 1.5, eta: 47 },
  feedback: { k: 1.5, eta: 280 },
};

/** Weibull survival probability in (0,1]: 1 at age 0, decreasing with age. */
export function survival(ageDays, type) {
  const p = DECAY[type];
  if (!p || ageDays <= 0) return 1;
  return Math.exp(-Math.pow(ageDays / p.eta, p.k));
}

/**
 * Confidence band at or above which an entry NEVER decays.
 *
 * Added 2026-08-31 after a live run flagged 7 entries at 0.9 — including
 * `project_public_claims_red_line`, which is BINDING policy pending an external
 * crypto review. Decay models "this may have quietly stopped being true"; a
 * LOCKED anchor does not become false by going unread, and nominating one for
 * retirement on a timer is how a review lane loses its credibility. This is the
 * same argument that already exempts `user` / `reference` entirely, applied to
 * the band rather than the type.
 *
 * Deliberately `>=` on the stored band, not on effective confidence: the stored
 * value is the human-set anchor, and a human is the only thing that should move
 * it off 0.9.
 */
export const LOCKED_CONFIDENCE = 0.9;

/**
 * Days over which a same-stamp cohort is spread, so a backfill does not detonate.
 *
 * Measured 2026-08-31: 50 of 90 flagged entries shared ONE `last_confirmed`
 * (2026-07-12, a bulk backfill), so they crossed the flag floor in the same
 * instant with identical `50d -> eff 0.234`. Backfill seeds `last_confirmed` to
 * today by design — which guarantees a future burst — and a lane that asks for
 * 90 decisions at once is one a human dismisses wholesale.
 *
 * The jitter is a deterministic function of the slug, NOT random: the same entry
 * must flag on the same day on every machine and every run, or the store stops
 * being reproducible and two nodes disagree about what is stale.
 */
export const JITTER_SPREAD_DAYS = 28;

/** FNV-1a over the slug -> a stable offset in [0, spread). Same input, same day, forever. */
export function jitterDays(slug, spread = JITTER_SPREAD_DAYS) {
  if (!slug || !spread) return 0;
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % spread;
}

/** Filesystem path or bare name -> slug, so callers need not change signature. */
export function slugOf(fileOrSlug) {
  if (!fileOrSlug) return null;
  const base = String(fileOrSlug).split('/').pop();
  return base.endsWith('.md') ? base.slice(0, -3) : base;
}

/**
 * Time-decayed confidence used for FLAGGING ONLY — never written back to a file.
 * Stored `confidence` stays the human-set banded anchor; this multiplies it by
 * the Weibull survival since `last_confirmed`. Returns the stored confidence
 * unchanged when the type doesn't decay, the band is LOCKED, or dates are missing.
 *
 * `memo.file` (when present) supplies the cohort jitter. It is read off the memo
 * rather than added as a parameter so both review shells keep working untouched.
 */
export function effectiveConfidence(memo, todayISO) {
  if (memo.confidence === null) return null;
  if (memo.confidence >= LOCKED_CONFIDENCE) return memo.confidence;
  if (!DECAY[memo.type] || !memo.last_confirmed) return memo.confidence;
  const age = ageInDays(memo.last_confirmed, todayISO) - jitterDays(slugOf(memo.file));
  return memo.confidence * survival(age, memo.type);
}
