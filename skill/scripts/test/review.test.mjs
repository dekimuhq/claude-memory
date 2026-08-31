import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { parseMemo, ageInDays, survival, effectiveConfidence, jitterDays, slugOf } from '../lib.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (f) => fs.readFileSync(path.join(FIX, f), 'utf8');

test('parseMemo reads flat frontmatter', () => {
  const m = parseMemo(read('feedback_flat_fresh.md'));
  assert.equal(m.type, 'feedback');
  assert.equal(m.confidence, 0.7);
  assert.equal(m.last_confirmed, '2026-05-20');
  assert.equal(m.hasConfidence, true);
});

test('parseMemo reads nested (metadata:) frontmatter', () => {
  const m = parseMemo(read('project_nested_stale.md'));
  assert.equal(m.type, 'project');
  assert.equal(m.confidence, 0.5);
  assert.equal(m.last_confirmed, '2026-04-01');
});

test('parseMemo flags un-backfilled file', () => {
  const m = parseMemo(read('feedback_needs_backfill.md'));
  assert.equal(m.type, 'feedback');
  assert.equal(m.hasConfidence, false);
});

test('ageInDays computes whole-day difference', () => {
  assert.equal(ageInDays('2026-05-01', '2026-05-31'), 30);
});

test('parseMemo reads superseded_by when present, null when absent', () => {
  assert.equal(parseMemo(read('feedback_superseded.md')).superseded_by, 'newer-rule-slug');
  assert.equal(parseMemo(read('feedback_flat_fresh.md')).superseded_by, null);
});

test('survival is 1 at age 0, monotonically decreasing, and never decays stable types', () => {
  assert.equal(survival(0, 'feedback'), 1);
  assert.equal(survival(500, 'user'), 1);        // user/reference never decay
  assert.equal(survival(500, 'reference'), 1);
  assert.ok(survival(30, 'project') > survival(90, 'project'));
  assert.ok(survival(90, 'project') > 0);
});

test('effectiveConfidence decays project faster than feedback for equal age', () => {
  const at = (type, conf, lc) =>
    effectiveConfidence({ type, confidence: conf, last_confirmed: lc }, '2026-05-31');
  // 60 days old, both stored at 0.5 — project should be more eroded than feedback.
  const proj = at('project', 0.5, '2026-04-01');
  const fb = at('feedback', 0.5, '2026-04-01');
  assert.ok(proj < fb, `project ${proj} should decay below feedback ${fb}`);
  // No last_confirmed → falls back to stored confidence unchanged.
  assert.equal(at('feedback', 0.5, null), 0.5);
});

import { flagDir } from '../review.mjs';

test('flagDir: decay subsumes staleness, grading by stored confidence', () => {
  const out = flagDir(FIX, '2026-05-31');
  const names = (g) => out[g].map((e) => path.basename(e.file)).sort();

  // Both former-"stale" fixtures now surface via time-decayed confidence.
  assert.deepEqual(names('decayed'),
    ['feedback_flat_stale.md', 'project_nested_stale.md']);
  // Same last_confirmed as flat_stale but stored at 0.9 → stays above floor.
  assert.ok(!names('decayed').includes('feedback_core_resists.md'));

  assert.deepEqual(names('lowConfidence'), ['feedback_lowconf.md']);
  assert.deepEqual(names('superseded'), ['feedback_superseded.md']);
  assert.deepEqual(names('needsBackfill'), ['feedback_needs_backfill.md']);

  const all = [...out.decayed, ...out.lowConfidence, ...out.superseded, ...out.needsBackfill]
    .map((e) => path.basename(e.file));
  assert.ok(!all.includes('user_stable.md'));
  assert.ok(!all.includes('reference_stable.md'));
  assert.ok(!all.includes('feedback_flat_fresh.md'));
  // A born-low entry is never double-flagged as decayed.
  assert.ok(!names('decayed').includes('feedback_lowconf.md'));
});

test('flagDir is read-only — fixture files are untouched', () => {
  const before = fs.readdirSync(FIX).map((f) => [f, read(f)]);
  flagDir(FIX, '2026-05-31');
  for (const [f, content] of before) {
    assert.equal(read(f), content, `${f} must not be modified by flagDir`);
  }
});

// ── LOCKED band never decays (added 2026-08-31) ────────────────────────────
test('a 0.9 LOCKED entry never decays, at any age', () => {
  for (const age of ['2026-07-12', '2025-01-01', '2020-01-01']) {
    for (const type of ['project', 'feedback']) {
      const eff = effectiveConfidence({ type, confidence: 0.9, last_confirmed: age }, '2026-08-31');
      assert.equal(eff, 0.9, `${type} @0.9 must not decay (last_confirmed ${age})`);
    }
  }
});

// Negative control: without this the exemption could be swallowing everything.
test('the LOCKED exemption is narrow — 0.7 still decays', () => {
  const eff = effectiveConfidence(
    { type: 'project', confidence: 0.7, last_confirmed: '2026-01-01', file: 'x.md' }, '2026-08-31');
  assert.ok(eff < 0.7, 'a 0.7 project entry must still decay');
});

// ── cohort jitter (added 2026-08-31) ───────────────────────────────────────
test('jitterDays is deterministic and inside [0, spread)', () => {
  for (const s of ['project_alpha', 'feedback_beta', 'x', '']) {
    const a = jitterDays(s, 28), b = jitterDays(s, 28);
    assert.equal(a, b, 'same slug must give the same offset on every run and machine');
    assert.ok(a >= 0 && a < 28, `offset ${a} out of range for "${s}"`);
  }
});

test('jitter spreads a same-stamp cohort instead of firing it at once', () => {
  // The real failure: 50 entries shared last_confirmed 2026-07-12 and all crossed
  // the floor on the same day. Distinct slugs must land on distinct effective ages.
  const stamp = '2026-07-12';
  const effs = new Set(
    Array.from({ length: 40 }, (_, i) =>
      effectiveConfidence(
        { type: 'project', confidence: 0.7, last_confirmed: stamp, file: `project_entry_${i}.md` },
        '2026-08-31')));
  assert.ok(effs.size > 5, `cohort collapsed to ${effs.size} distinct values — jitter is not spreading it`);
});

test('jitter only ever DELAYS a flag, never causes an early one', () => {
  // Offset is subtractive, so effective age <= real age and survival >= unjittered.
  const base = effectiveConfidence(
    { type: 'project', confidence: 0.7, last_confirmed: '2026-07-12' }, '2026-08-31'); // no file -> no jitter
  for (let i = 0; i < 30; i++) {
    const j = effectiveConfidence(
      { type: 'project', confidence: 0.7, last_confirmed: '2026-07-12', file: `s_${i}.md` }, '2026-08-31');
    assert.ok(j >= base, `slug s_${i} decayed FASTER than unjittered — jitter must not pull a flag forward`);
  }
});

test('slugOf takes a path or a bare name, and survives null', () => {
  assert.equal(slugOf('/a/b/project_x.md'), 'project_x');
  assert.equal(slugOf('project_x.md'), 'project_x');
  assert.equal(slugOf('project_x'), 'project_x');
  assert.equal(slugOf(null), null);
  assert.equal(jitterDays(null), 0, 'a memo with no file must simply not jitter');
});
