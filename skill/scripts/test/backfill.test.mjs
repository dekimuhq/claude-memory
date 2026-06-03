import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backfillText } from '../backfill.mjs';
import { parseMemo } from '../lib.mjs';

const FLAT_NEEDS = `---
name: Unmigrated rule
description: flat feedback, no confidence yet
type: feedback
originSessionId: abc-123
---
Body.
`;

const NESTED_NEEDS = `---
name: nested-project
description: nested project, no confidence yet
metadata:
  node_type: memory
  type: project
  originSessionId: xyz-9
---
Body.
`;

const ALREADY = `---
name: done
description: already migrated
type: feedback
confidence: 0.7
created: 2026-01-01
last_confirmed: 2026-01-01
reaffirm_count: 0
---
Body.
`;

test('backfillText adds flat fields before closing ---', () => {
  const out = backfillText(FLAT_NEEDS, '2026-05-29');
  const m = parseMemo(out);
  assert.equal(m.confidence, 0.7);
  assert.equal(m.created, '2026-05-29');
  assert.equal(m.last_confirmed, '2026-05-29');
  assert.ok(out.includes('reaffirm_count: 0'));
  assert.ok(out.includes('Body.'));
});

test('backfillText adds indented fields inside metadata: block', () => {
  const out = backfillText(NESTED_NEEDS, '2026-05-29');
  const m = parseMemo(out);
  assert.equal(m.confidence, 0.7);
  assert.equal(m.created, '2026-05-29');
  assert.ok(/\n  confidence: 0\.7/.test(out));
});

test('backfillText is idempotent when confidence already present', () => {
  const out = backfillText(ALREADY, '2026-05-29');
  assert.equal(out, ALREADY);
});

test('backfillText leaves user/reference files unchanged', () => {
  const USER = `---\nname: x\ndescription: y\ntype: user\n---\nB.\n`;
  const REF = `---\nname: x\ndescription: y\ntype: reference\n---\nB.\n`;
  assert.equal(backfillText(USER, '2026-05-29'), USER);
  assert.equal(backfillText(REF, '2026-05-29'), REF);
});

const NESTED_ALREADY = `---
name: nested-done
description: nested project, already migrated
metadata:
  node_type: memory
  type: project
  confidence: 0.7
  created: 2026-01-01
  last_confirmed: 2026-01-01
  reaffirm_count: 0
---
Body.
`;

test('backfillText is idempotent on an already-migrated NESTED file', () => {
  const out = backfillText(NESTED_ALREADY, '2026-05-29');
  assert.equal(out, NESTED_ALREADY);
});
