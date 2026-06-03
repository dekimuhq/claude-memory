#!/usr/bin/env node
// SessionStart hook: surface memory-review necessity.
// Runs the read-only flagger; if any feedback/project memory is decayed,
// low-confidence, superseded, or un-backfilled, injects a one-line context
// nudge telling Claude to run the memory-review skill this session. Silent
// when nothing's flagged — zero token cost on a clean store. Never writes,
// never blocks.
//
// Setup: set MEMORY_DIR to your memory directory (the same dir review.mjs reads)
// and point this hook's import at wherever you installed the skill scripts.
import { flagDir } from '../skill/scripts/review.mjs';

const DIR = process.env.MEMORY_DIR;
if (!DIR) process.exit(0); // not configured — stay silent

let r;
try {
  const today = new Date().toISOString().slice(0, 10);
  r = flagDir(DIR, today);
} catch {
  process.exit(0); // never disrupt session start
}

const parts = [];
if (r.needsBackfill.length) parts.push(`${r.needsBackfill.length} un-backfilled`);
if (r.decayed.length) parts.push(`${r.decayed.length} decayed`);
if (r.lowConfidence.length) parts.push(`${r.lowConfidence.length} low-confidence`);
if (r.superseded.length) parts.push(`${r.superseded.length} superseded`);

if (parts.length === 0) process.exit(0);

const msg =
  `[memory-review] ${parts.join(', ')} feedback/project memories need attention. ` +
  `Invoke the memory-review skill this session: present the flagged list and walk ` +
  `the user through confirm / demote / delete / edit per entry. Do not silently skip.`;

console.log(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg },
}));
