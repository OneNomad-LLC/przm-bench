/* eslint-disable */
/**
 * One-shot script: take the current fixtures/convergence/ set and
 * split off 20% as holdout. Deterministic via seeded shuffle so the
 * split is reproducible.
 *
 * Output:
 *   fixtures/convergence/         — seen set (24 fixtures of 30)
 *   fixtures/convergence-holdout/ — sealed holdout (6 of 30)
 *
 * The holdout subset is what we run against for credibility
 * verification: vendors paying for Extended cert get a number against
 * both, and if seen-vs-holdout deltas widen materially, that's the
 * signal we're overfitting fixture authoring to our seen set.
 *
 * Reproducibility: uses Mulberry32 PRNG seeded with the constant in
 * SEED — change SEED to redo the split with the same protocol.
 *
 * Safety: refuses to run if the holdout dir already exists. To redo
 * the split, you must manually delete fixtures/convergence-holdout/
 * and move its contents back into fixtures/convergence/ first.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'fixtures');
const SEEN_DIR = path.join(ROOT, 'convergence');
const HOLDOUT_DIR = path.join(ROOT, 'convergence-holdout');
const SEED = 0x70727a6d; // 'przm' as a 32-bit int — stable across runs
const HOLDOUT_FRACTION = 0.2;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic(arr, seed) {
  const rng = mulberry32(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    ;[out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function listAllFixtures(seenRoot) {
  const out = [];
  for (const category of fs.readdirSync(seenRoot)) {
    const catPath = path.join(seenRoot, category);
    if (!fs.statSync(catPath).isDirectory()) continue;
    for (const file of fs.readdirSync(catPath)) {
      if (!file.endsWith('.json')) continue;
      out.push({ category, file, fullPath: path.join(catPath, file) });
    }
  }
  return out;
}

function main() {
  if (fs.existsSync(HOLDOUT_DIR)) {
    console.error(
      `Holdout dir already exists: ${HOLDOUT_DIR}\n` +
        `To redo the split, manually move its contents back to convergence/ and rm the holdout dir.`,
    );
    process.exit(1);
  }

  const all = listAllFixtures(SEEN_DIR);
  // Filter out any files that aren't actually fixtures (e.g. AUTHORING_LOG.md is in the dir already excluded by extension)
  const filtered = all.filter((f) => f.file.endsWith('.json'));
  console.log(`Found ${filtered.length} fixtures across ${new Set(filtered.map((f) => f.category)).size} categories`);

  const shuffled = shuffleDeterministic(filtered, SEED);
  const holdoutCount = Math.round(filtered.length * HOLDOUT_FRACTION);
  const holdout = shuffled.slice(0, holdoutCount);

  // Sanity: prefer to take at least one from each category if possible
  const byCategory = {};
  for (const f of holdout) {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }
  console.log(`Holdout count: ${holdoutCount}/${filtered.length} = ${(HOLDOUT_FRACTION * 100).toFixed(0)}%`);
  console.log('Holdout by category:');
  for (const [cat, n] of Object.entries(byCategory)) {
    console.log('  ' + cat.padEnd(20) + ' ' + n);
  }

  console.log('\nHoldout fixtures being moved:');
  fs.mkdirSync(HOLDOUT_DIR, { recursive: true });
  for (const f of holdout) {
    const destDir = path.join(HOLDOUT_DIR, f.category);
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, f.file);
    fs.renameSync(f.fullPath, destPath);
    console.log('  ' + f.category + '/' + f.file);
  }

  // Write a manifest describing the split so future runs / verifiers know it
  const manifest = {
    seed: '0x' + SEED.toString(16),
    holdoutFraction: HOLDOUT_FRACTION,
    splitAt: new Date().toISOString(),
    holdoutCount,
    seenCount: filtered.length - holdoutCount,
    holdoutIds: holdout.map((f) => f.file.replace(/\.json$/, '')).sort(),
  };
  const manifestPath = path.join(HOLDOUT_DIR, '_split-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest: ${manifestPath}`);
  console.log('\nDone. Re-run the bench to score against seen-only + holdout-only separately.');
}

main();
