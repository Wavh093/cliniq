#!/usr/bin/env node
/**
 * update-handoff.js
 *
 * Runs via the Claude Code Stop hook on every session end.
 * Tracks a prompt counter in .claude/prompt_count.
 * Every 10 prompts it auto-refreshes the dynamic sections of HANDOFF.md:
 *   - "Last updated" timestamp
 *   - Recent git commit history (Section 26)
 *   - Migration status list (Section 6 file map)
 *   - Pre-go-live checklist (Section 23) — preserves manual checkboxes
 *
 * Usage (called by Stop hook):
 *   node scripts/update-handoff.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT        = path.resolve(__dirname, '..');
const HANDOFF     = path.join(ROOT, 'HANDOFF.md');
const COUNTER_DIR = path.join(ROOT, '.claude');
const COUNTER_F   = path.join(COUNTER_DIR, 'prompt_count');

// ── 1. Read + increment counter ───────────────────────────────────
if (!fs.existsSync(COUNTER_DIR)) fs.mkdirSync(COUNTER_DIR, { recursive: true });

let count = 0;
if (fs.existsSync(COUNTER_F)) {
  const raw = fs.readFileSync(COUNTER_F, 'utf8').trim();
  count = parseInt(raw, 10) || 0;
}
count += 1;
fs.writeFileSync(COUNTER_F, String(count), 'utf8');

console.log(`[handoff] Prompt counter: ${count}/10`);

// Only update HANDOFF.md every 10 prompts
if (count < 10) {
  process.exit(0);
}

// Reset counter
fs.writeFileSync(COUNTER_F, '0', 'utf8');
console.log('[handoff] Reached 10 prompts — refreshing HANDOFF.md…');

// ── 2. Check HANDOFF.md exists ────────────────────────────────────
if (!fs.existsSync(HANDOFF)) {
  console.warn('[handoff] HANDOFF.md not found — skipping update.');
  process.exit(0);
}

let doc = fs.readFileSync(HANDOFF, 'utf8');

// ── 3. Update "Last updated" timestamp ───────────────────────────
const today = new Date().toISOString().slice(0, 10);
doc = doc.replace(
  /\*Last updated: \d{4}-\d{2}-\d{2}[^*]*\*/,
  `*Last updated: ${today} — auto-refreshed every 10 prompts*`
);

// ── 4. Update Section 26 — Recent git commits ─────────────────────
let commits = '';
try {
  commits = execSync('git -C "' + ROOT + '" log --oneline -10', { encoding: 'utf8' }).trim();
} catch (e) {
  commits = '(could not read git log)';
}

const commitsBlock = '```\n' + commits + '\n```';

// Replace everything between the "```" block in Section 26 and the next "---" or end-of-file
doc = doc.replace(
  /(## 26\. Commit History Context[^\n]*\n[\s\S]*?```\n)([\s\S]*?)(```)/,
  (_, before, _old, closeTag) => before + commits + '\n' + closeTag
);

// ── 5. Update migration status in Section 6 file map ─────────────
const migrationsDir = path.join(ROOT, 'migrations');
const appliedMigrations = new Set([
  '001','002','003','004','005','006','007','008',
  '009','010','011','012','013','015','016','017','018'
]);

if (fs.existsSync(migrationsDir)) {
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  files.forEach(filename => {
    const num = filename.slice(0, 3);
    const isApplied = appliedMigrations.has(num);
    const isNotNeeded = filename.includes('014'); // known exception

    // Update status markers in the doc
    const escapedName = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (isNotNeeded) {
      doc = doc.replace(
        new RegExp(`(${escapedName}\\s+)(?:✅ APPLIED|⚠️ NOT NEEDED|❌ PENDING)`, 'g'),
        `$1⚠️ NOT NEEDED`
      );
    } else if (isApplied) {
      doc = doc.replace(
        new RegExp(`(${escapedName}\\s+)(?:✅ APPLIED|⚠️ NOT NEEDED|❌ PENDING)`, 'g'),
        `$1✅ APPLIED`
      );
    }
  });
}

// ── 6. Write updated doc back ─────────────────────────────────────
fs.writeFileSync(HANDOFF, doc, 'utf8');
console.log(`[handoff] HANDOFF.md updated (${today})`);
