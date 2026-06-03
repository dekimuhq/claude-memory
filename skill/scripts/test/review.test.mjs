import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { parseMemo, ageInDays, survival, effectiveConfidence } from '../lib.mjs';

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
