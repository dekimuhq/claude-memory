#!/usr/bin/env node
// Read-only. Flags feedback/project memories needing human review.
// Usage: node review.mjs [memoryDir] [--today YYYY-MM-DD] [--json]
//        MEMORY_DIR=/path/to/memory node review.mjs
import fs from 'node:fs';
import path from 'node:path';
import { parseMemo, ageInDays, effectiveConfidence } from './lib.mjs';

// Flag floor on confidence. `decayed` = a once-trusted entry whose time-decayed
// confidence has fallen to/below this; `lowConfidence` = a human deliberately set
// it low to begin with. Same floor, different cause — kept apart so the human
// sees whether to re-confirm (decay) or reconsider (born-low).
const FLAG_FLOOR = 0.3;

export function flagDir(dir, todayISO) {
  const out = { decayed: [], lowConfidence: [], superseded: [], needsBackfill: [] };
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const file = path.join(dir, name);
    const memo = parseMemo(fs.readFileSync(file, 'utf8'));
    if (memo.type !== 'feedback' && memo.type !== 'project') continue;

    if (memo.superseded_by) out.superseded.push({ file, ...memo });

    if (!memo.hasConfidence) { out.needsBackfill.push({ file, ...memo }); continue; }
    if (memo.confidence === null) continue;

    if (memo.confidence <= FLAG_FLOOR) {
      out.lowConfidence.push({ file, ...memo });
    } else {
      const eff = effectiveConfidence(memo, todayISO);
      if (eff !== null && eff <= FLAG_FLOOR) {
        const age = memo.last_confirmed ? ageInDays(memo.last_confirmed, todayISO) : null;
        out.decayed.push({ file, age, effective: Number(eff.toFixed(3)), ...memo });
      }
    }
  }
  return out;
}

function todayArg(argv) {
  const i = argv.indexOf('--today');
  return i !== -1 ? argv[i + 1] : new Date().toISOString().slice(0, 10);
}

/** Resolve the memory dir from a positional arg, then MEMORY_DIR, else fail loudly. */
export function resolveDir(args, today) {
  const positional = args.find((a) => !a.startsWith('--') && a !== today);
  const dir = positional || process.env.MEMORY_DIR;
  if (!dir) {
    console.error('No memory dir. Pass a path argument or set MEMORY_DIR=/path/to/memory');
    process.exit(2);
  }
  return dir;
}

// CLI entry — only runs when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const today = todayArg(args);
  const dir = resolveDir(args, today);
  const result = flagDir(dir, today);
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const [group, items] of Object.entries(result)) {
      console.log(`\n## ${group} (${items.length})`);
      for (const it of items) {
        let extra = '';
        if (it.effective != null) extra = ` — ${it.age}d → eff ${it.effective}`;
        else if (it.superseded_by) extra = ` — superseded_by ${it.superseded_by}`;
        console.log(`  - ${path.basename(it.file)} [${it.type}, conf ${it.confidence ?? '—'}]${extra}`);
      }
    }
  }
}
