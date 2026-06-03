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
 * Time-decayed confidence used for FLAGGING ONLY — never written back to a file.
 * Stored `confidence` stays the human-set banded anchor; this multiplies it by
 * the Weibull survival since `last_confirmed`. Returns the stored confidence
 * unchanged when the type doesn't decay or dates are missing.
 */
export function effectiveConfidence(memo, todayISO) {
  if (memo.confidence === null) return null;
  if (!DECAY[memo.type] || !memo.last_confirmed) return memo.confidence;
  const age = ageInDays(memo.last_confirmed, todayISO);
  return memo.confidence * survival(age, memo.type);
}
