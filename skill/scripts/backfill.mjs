#!/usr/bin/env node
// One-time migration: add confidence/created/last_confirmed/reaffirm_count to
// feedback/project memories that lack them. Dry-run by default; --apply writes.
// Usage: node backfill.mjs [memoryDir] [--apply]
//        MEMORY_DIR=/path/to/memory node backfill.mjs --apply
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseMemo } from './lib.mjs';

const DEFAULT_CONFIDENCE = 0.7;

/** Pure text transform — add the four fields in the file's existing style. */
export function backfillText(src, dateISO) {
  const memo = parseMemo(src);
  if (memo.type !== 'feedback' && memo.type !== 'project') return src;
  if (memo.hasConfidence) return src;

  const fmMatch = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return src;
  const fm = fmMatch[1];

  const flatFields =
    `confidence: ${DEFAULT_CONFIDENCE}\n` +
    `created: ${dateISO}\n` +
    `last_confirmed: ${dateISO}\n` +
    `reaffirm_count: 0`;

  // Nested when the type key is indented or a metadata: block exists —
  // robust to empty/odd metadata blocks (avoids split-brain frontmatter).
  const nested = /^[ \t]+type:/m.test(fm) || /^metadata:/m.test(fm);
  let newFm;
  if (nested) {
    const indented = flatFields.split('\n').map((l) => '  ' + l).join('\n');
    newFm = fm.replace(/\s*$/, '') + '\n' + indented;
  } else {
    newFm = fm.replace(/\s*$/, '') + '\n' + flatFields;
  }
  return src.replace(fmMatch[0], `---\n${newFm}\n---`);
}

/** Git-blame creation date for a file; fallback to `fallbackISO`. */
function createdDate(file, fallbackISO) {
  try {
    const out = execFileSync(
      'git', ['log', '--diff-filter=A', '--format=%aI', '--', file],
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean).pop();
    return out ? out.slice(0, 10) : fallbackISO;
  } catch { return fallbackISO; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dir = args.find((a) => !a.startsWith('--')) || process.env.MEMORY_DIR;
  if (!dir) {
    console.error('No memory dir. Pass a path argument or set MEMORY_DIR=/path/to/memory');
    process.exit(2);
  }
  const today = new Date().toISOString().slice(0, 10);
  let changed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const file = path.join(dir, name);
    const src = fs.readFileSync(file, 'utf8');
    const date = createdDate(file, today);
    const next = backfillText(src, date);
    if (next !== src) {
      changed++;
      if (apply) fs.writeFileSync(file, next);
      else console.log(`would migrate: ${name} (created ${date})`);
    }
  }
  console.log(`${apply ? 'migrated' : 'would migrate'} ${changed} file(s)`);
}
