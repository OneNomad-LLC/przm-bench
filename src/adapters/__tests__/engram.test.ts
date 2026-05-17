/**
 * EngramAdapter smoke + contract tests.
 *
 * Uses node:test (built-in, no extra dep).  Run with:
 *   npm test
 *
 * ── SETUP NOTES ─────────────────────────────────────────────────────────────
 *
 * First-run warm-up: engram downloads Xenova/all-MiniLM-L6-v2 (~22 MB) from
 * Hugging Face on first use and caches it under $HF_HOME or
 * ~/.cache/huggingface.  Subsequent runs are fast.  In CI, pre-warm the model
 * in the container image or set HF_HOME to a persistent cache volume.
 *
 * The STORAGE_BACKEND=file override is set inside engram.ts at module load,
 * so no cloud routing happens even if ~/.pyre/credentials.json exists.
 *
 * Tests use isolated temp directories per adapter instance; each test
 * calls cleanup() at the end so temp dirs don't accumulate.
 */

// STORAGE_BACKEND must be set before any engram import.  The adapter sets it,
// but because node:test may load modules before our adapter is imported below,
// set it here defensively as well.
process.env['STORAGE_BACKEND'] = 'file';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngramAdapter } from '../engram.js';
import type { MemoryItem } from '../../types.js';

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeItem(id: string, content: string, timestamp?: string): MemoryItem {
  return {
    id,
    content,
    metadata: {},
    timestamp: timestamp ?? new Date().toISOString(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('smoke: ingest 3 items, query returns the matching item in top-K', async () => {
  const adapter = new EngramAdapter();
  try {
    const items: MemoryItem[] = [
      makeItem('item-1', 'The capital of France is Paris.'),
      makeItem('item-2', 'TypeScript adds static types to JavaScript.'),
      makeItem('item-3', 'LanceDB is an embedded vector database.'),
    ];

    await adapter.ingest(items);

    const results = await adapter.query('What is the capital of France?', { k: 3 });

    assert.ok(results.length > 0, 'Expected at least one result');

    // The top result should map back to one of our ingested item IDs.
    const returnedIds = results.map((r) => r.id);
    assert.ok(
      returnedIds.includes('item-1'),
      `Expected item-1 to appear in top-3. Got: ${returnedIds.join(', ')}`,
    );

    // Score must be in [0, 1].
    for (const r of results) {
      assert.ok(r.score >= 0 && r.score <= 1, `Score out of range: ${r.score}`);
      assert.ok(typeof r.content === 'string' && r.content.length > 0, 'Content must be non-empty');
    }
  } finally {
    await adapter.cleanup();
  }
});

test('reset: ingest then reset, query returns empty result', async () => {
  const adapter = new EngramAdapter();
  try {
    const items: MemoryItem[] = [
      makeItem('reset-1', 'The sky is blue.'),
      makeItem('reset-2', 'Water is composed of hydrogen and oxygen.'),
    ];

    await adapter.ingest(items);
    await adapter.reset();

    const results = await adapter.query('What colour is the sky?', { k: 5 });

    assert.strictEqual(
      results.length,
      0,
      `Expected 0 results after reset, got ${results.length}`,
    );
  } finally {
    await adapter.cleanup();
  }
});

test('temporal: query with opts.when passes referenceDate to engram search', async () => {
  const adapter = new EngramAdapter();
  try {
    // Ingest items with timestamps spread across different dates.
    const anchorDate = new Date('2024-03-15T12:00:00Z');
    const daysAgo30 = new Date(anchorDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const daysAgo5 = new Date(anchorDate.getTime() - 5 * 24 * 60 * 60 * 1000);

    const items: MemoryItem[] = [
      makeItem(
        'old-item',
        'Meeting notes: discussed Q1 budget allocation and headcount planning.',
        daysAgo30.toISOString(),
      ),
      makeItem(
        'recent-item',
        'Meeting notes: reviewed Q2 roadmap and sprint velocity.',
        daysAgo5.toISOString(),
      ),
    ];

    await adapter.ingest(items);

    // Query with a when= set to our anchor date.  Engram uses this as the
    // temporal reference so relative expressions like "5 days ago" resolve
    // within the dataset's timeline rather than wall-clock now.
    const results = await adapter.query('recent meeting notes about sprint velocity', {
      k: 5,
      when: anchorDate,
    });

    // We only assert that the call doesn't throw and returns valid shape —
    // ranking order depends on embedding similarity which is model-dependent.
    // What matters here is that the temporal parameter is wired through
    // without error.
    assert.ok(Array.isArray(results), 'Results must be an array');
    for (const r of results) {
      assert.ok(typeof r.id === 'string', 'id must be a string');
      assert.ok(r.score >= 0 && r.score <= 1, `Score out of range: ${r.score}`);
      assert.ok(typeof r.content === 'string', 'content must be a string');
    }

    // Both items should have been ingested; if any result comes back,
    // its ID should be one we know about.
    const knownIds = new Set(['old-item', 'recent-item']);
    for (const r of results) {
      assert.ok(
        knownIds.has(r.id),
        `Unexpected id in results: ${r.id}`,
      );
    }
  } finally {
    await adapter.cleanup();
  }
});

test('metadata: adapter exposes correct name and version', () => {
  const adapter = new EngramAdapter();
  assert.strictEqual(adapter.name, 'engram');
  assert.match(
    adapter.version,
    /^\d+\.\d+\.\d+/,
    `Expected semver version, got: ${adapter.version}`,
  );
});
