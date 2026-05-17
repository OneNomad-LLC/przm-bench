/* eslint-disable */
/**
 * Sync the latest signed receipts from bench/results/published/convergence/
 * into przm-web/public/receipts/convergence/ so the leaderboard +
 * /receipts pages pick them up.
 *
 * Behaviour:
 * - Copies any new receipt files (filename not already in dest).
 * - Doesn't overwrite. If you want to refresh a receipt, delete from
 *   dest first then re-run.
 *
 * Usage:
 *   node scripts/sync-receipts-to-web.cjs
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'results', 'published', 'convergence');
const DEST = path.join(__dirname, '..', '..', 'przm-web', 'public', 'receipts', 'convergence');

if (!fs.existsSync(SRC)) {
  console.error('Source dir not found: ' + SRC);
  process.exit(1);
}
if (!fs.existsSync(DEST)) {
  console.log('Creating dest: ' + DEST);
  fs.mkdirSync(DEST, { recursive: true });
}

const srcFiles = new Set(fs.readdirSync(SRC).filter((f) => f.endsWith('.json')));
const destFiles = new Set(fs.readdirSync(DEST).filter((f) => f.endsWith('.json')));

let copied = 0;
let skipped = 0;

for (const f of srcFiles) {
  if (destFiles.has(f)) {
    skipped++;
    continue;
  }
  fs.copyFileSync(path.join(SRC, f), path.join(DEST, f));
  console.log('  + ' + f);
  copied++;
}

console.log(`\nCopied ${copied} new receipt(s); ${skipped} already in dest.`);

if (copied > 0) {
  console.log('\nNext steps:');
  console.log('  1. cd ../przm-web');
  console.log('  2. Update src/lib/leaderboard.ts entries to reference the new receipt UUIDs');
  console.log('  3. npm run build (verify static params catch the new IDs)');
  console.log('  4. Commit + push to trigger Vercel deploy');
}
