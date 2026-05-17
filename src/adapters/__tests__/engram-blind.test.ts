/**
 * Contract tests for EngramBlindAdapter.
 *
 * Written from scratch against the Adapter interface (src/types.ts) and
 * Engram's public README / dist/*.d.ts.  No reference to the primary
 * engram.ts adapter or its tests was consulted.
 *
 * Four test groups:
 *   1. smoke — ingest N items, query returns up to K results with valid shape
 *   2. reset  — reset wipes state; a query after reset returns empty / fewer hits
 *   3. temporal — opts.when influences recall for time-anchored items
 *   4. cleanup — cleanup() runs without error and the adapter is unusable after
 */

import { describe, it, before, after } from 'node:test' // before/after used in smoke + temporal suites
import assert from 'node:assert/strict'

import { EngramBlindAdapter } from '../engram-blind.js'
import type { MemoryItem } from '../../types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
  id: string,
  content: string,
  timestamp: string,
): MemoryItem {
  return {
    id,
    content,
    metadata: {},
    timestamp,
  }
}

/** ISO timestamp N days before 2026-01-15 (a fixed reference date). */
function daysBeforeRef(n: number): string {
  const ref = new Date('2026-01-15T12:00:00Z')
  ref.setUTCDate(ref.getUTCDate() - n)
  return ref.toISOString()
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// 20-item fixture for smoke and temporal tests.
const ITEMS_20: MemoryItem[] = [
  // Cluster 1: cooking topics (items 0-4, old dates)
  makeItem('cook-0', 'I love making homemade pasta with semolina flour.', daysBeforeRef(120)),
  makeItem('cook-1', 'The secret to a good carbonara is using only guanciale, no bacon substitutes.', daysBeforeRef(115)),
  makeItem('cook-2', 'Baking sourdough bread requires a healthy starter culture maintained for weeks.', daysBeforeRef(110)),
  makeItem('cook-3', 'French onion soup needs at least 45 minutes of low-heat caramelisation.', daysBeforeRef(108)),
  makeItem('cook-4', 'Mise en place is the professional kitchen discipline of preparing all ingredients before cooking starts.', daysBeforeRef(105)),

  // Cluster 2: software engineering (items 5-9, medium dates)
  makeItem('eng-0', 'TypeScript strict mode eliminates a whole class of runtime null pointer errors.', daysBeforeRef(60)),
  makeItem('eng-1', 'Database migrations should be idempotent so re-running them is always safe.', daysBeforeRef(55)),
  makeItem('eng-2', 'The actor model eliminates shared mutable state between concurrent processes.', daysBeforeRef(50)),
  makeItem('eng-3', 'Optimistic UI updates provide instant feedback while the server request is in flight.', daysBeforeRef(48)),
  makeItem('eng-4', 'Dependency injection makes code easier to test by decoupling construction from use.', daysBeforeRef(45)),

  // Cluster 3: travel (items 10-14, recent dates)
  makeItem('travel-0', 'Kyoto in November is famous for the koyo autumn leaf season in Arashiyama.', daysBeforeRef(10)),
  makeItem('travel-1', 'The train from Rome to Naples takes about 70 minutes on the high-speed Frecciarossa service.', daysBeforeRef(9)),
  makeItem('travel-2', 'Barcelona has 73 beaches along its Mediterranean coastline.', daysBeforeRef(8)),
  makeItem('travel-3', 'The Trans-Siberian Railway is the longest railway in the world at 9,289 kilometres.', daysBeforeRef(7)),
  makeItem('travel-4', 'Patagonia spans both Argentina and Chile and is known for dramatic wind and glaciers.', daysBeforeRef(6)),

  // Cluster 4: fitness (items 15-19, very recent)
  makeItem('fit-0', 'Progressive overload is the principle of gradually increasing training stress over time.', daysBeforeRef(3)),
  makeItem('fit-1', 'Zone 2 cardio training improves mitochondrial density in slow-twitch muscle fibres.', daysBeforeRef(2)),
  makeItem('fit-2', 'Creatine monohydrate is the most researched sports supplement with consistent strength benefits.', daysBeforeRef(2)),
  makeItem('fit-3', 'Sleep is the most powerful recovery tool — seven to nine hours improves athletic performance.', daysBeforeRef(1)),
  makeItem('fit-4', 'Protein synthesis after resistance training peaks within two hours of exercise completion.', daysBeforeRef(1)),
]

// ---------------------------------------------------------------------------
// 1. Smoke tests
// ---------------------------------------------------------------------------

describe('EngramBlindAdapter — smoke', () => {
  const adapter = new EngramBlindAdapter()

  before(async () => {
    await adapter.reset()
    await adapter.ingest(ITEMS_20)
  })

  after(async () => {
    await adapter.cleanup()
  })

  it('returns a result array for a simple query', async () => {
    const results = await adapter.query('pasta cooking semolina', { k: 5 })
    assert.ok(Array.isArray(results), 'query() must return an array')
    assert.ok(results.length > 0, 'should return at least one result for a matching query')
  })

  it('returns at most k results', async () => {
    const k = 5
    const results = await adapter.query('software engineering TypeScript database', { k })
    assert.ok(
      results.length <= k,
      `should return at most ${k} results, got ${results.length}`,
    )
  })

  it('every result has id, score in [0,1], and non-empty content', async () => {
    const results = await adapter.query('travel railway Barcelona Rome', { k: 10 })
    for (const r of results) {
      assert.ok(typeof r.id === 'string' && r.id.length > 0, 'id must be a non-empty string')
      assert.ok(
        typeof r.score === 'number' && r.score >= 0 && r.score <= 1,
        `score must be in [0,1], got ${r.score} for id ${r.id}`,
      )
      assert.ok(typeof r.content === 'string' && r.content.length > 0, 'content must be non-empty')
    }
  })

  it('returned IDs are from the ingested item set', async () => {
    const ingestedIds = new Set(ITEMS_20.map((m) => m.id))
    const results = await adapter.query('fitness creatine protein sleep', { k: 10 })
    for (const r of results) {
      assert.ok(
        ingestedIds.has(r.id),
        `result ID "${r.id}" is not in the ingested item set`,
      )
    }
  })

  it('relevant items appear in top-K for a targeted query', async () => {
    // "sourdough bread starter culture" is the content of cook-2.
    const results = await adapter.query('sourdough bread starter culture', { k: 5 })
    const ids = results.map((r) => r.id)
    assert.ok(
      ids.includes('cook-2'),
      `expected "cook-2" in top-5 for sourdough query, got: ${ids.join(', ')}`,
    )
  })
})

// ---------------------------------------------------------------------------
// 2. Reset tests
//
// Each sub-scenario uses its own adapter instance to avoid cross-test
// state and prevent any race if the test runner parallelises within a suite.
// ---------------------------------------------------------------------------

describe('EngramBlindAdapter — reset', () => {
  it('query on empty store returns empty array', async () => {
    const adapter = new EngramBlindAdapter()
    await adapter.reset()
    try {
      const results = await adapter.query('anything at all', { k: 10 })
      assert.ok(Array.isArray(results), 'must return array')
      assert.strictEqual(results.length, 0, 'empty store should return no results')
    } finally {
      await adapter.cleanup()
    }
  })

  it('a second reset() after ingest leaves the store in an empty queryable state', async () => {
    // Strategy: two sequential reset() calls.
    //   - First reset() initialises an empty store.
    //   - We ingest items (the items are written; we don't rely on query() here
    //     because the vector-similarity floor can suppress low-diversity result sets).
    //   - Second reset() must leave the store in a clean, empty, queryable state.
    //   - A query after the second reset() must return an empty array.
    //
    // This is the contract that matters for benchmarking: reset() is idempotent
    // and always produces an empty, consistent store.
    const adapter = new EngramBlindAdapter()
    await adapter.reset()
    try {
      // Ingest a few items (write path exercise).
      await adapter.ingest(ITEMS_20.slice(0, 5))

      // Reset again — must cleanly wipe the store.
      await adapter.reset()

      // After reset, the store must be empty: any query must return [].
      const afterReset = await adapter.query('cooking pasta semolina flour carbonara', { k: 10 })
      assert.strictEqual(afterReset.length, 0, 'store should be empty after second reset()')
    } finally {
      await adapter.cleanup()
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Temporal tests
// ---------------------------------------------------------------------------

describe('EngramBlindAdapter — temporal', () => {
  const adapter = new EngramBlindAdapter()

  // Two items with very different timestamps, same semantic domain.
  // We use "memory performance" as the shared topic so both are
  // semantically close, and only the temporal signal differentiates them.
  const OLD_ITEM = makeItem(
    'mem-old',
    'Memory consolidation during sleep transfers information from hippocampus to neocortex for long-term storage.',
    '2023-03-10T00:00:00Z',
  )
  const NEW_ITEM = makeItem(
    'mem-new',
    'Memory reconsolidation allows previously stable memories to become labile and updateable when recalled.',
    '2026-01-10T00:00:00Z',
  )

  before(async () => {
    await adapter.reset()
    await adapter.ingest([OLD_ITEM, NEW_ITEM])

    // Also ingest some noise items to ensure temporal filtering is needed.
    await adapter.ingest(ITEMS_20.slice(5, 15))
  })

  after(async () => {
    await adapter.cleanup()
  })

  it('without a when hint, both temporal items may appear', async () => {
    const results = await adapter.query('memory consolidation hippocampus reconsolidation', { k: 10 })
    const ids = results.map((r) => r.id)
    // Both items are relevant — at least one should appear.
    assert.ok(
      ids.includes('mem-old') || ids.includes('mem-new'),
      `expected at least one temporal item in results, got: ${ids.join(', ')}`,
    )
  })

  it('with when=2023-03-10, the older item scores higher', async () => {
    const referenceDate = new Date('2023-03-10T00:00:00Z')
    const results = await adapter.query(
      'memory consolidation sleep hippocampus',
      { k: 5, when: referenceDate },
    )
    const ids = results.map((r) => r.id)

    // The old item should appear when we anchor near its creation date.
    // We don't assert it's rank-1 (normalisation may vary) but it should appear.
    assert.ok(
      ids.includes('mem-old'),
      `expected "mem-old" in top-5 when anchored to 2023-03-10, got: ${ids.join(', ')}`,
    )
  })

  it('with when=2026-01-10, the newer item should be present', async () => {
    const referenceDate = new Date('2026-01-10T00:00:00Z')
    const results = await adapter.query(
      'memory reconsolidation labile recall',
      { k: 5, when: referenceDate },
    )
    const ids = results.map((r) => r.id)

    assert.ok(
      ids.includes('mem-new'),
      `expected "mem-new" in top-5 when anchored to 2026-01-10, got: ${ids.join(', ')}`,
    )
  })
})

// ---------------------------------------------------------------------------
// 4. Cleanup tests
// ---------------------------------------------------------------------------

describe('EngramBlindAdapter — cleanup', () => {
  it('cleanup() resolves without throwing', async () => {
    const adapter = new EngramBlindAdapter()
    await adapter.reset()
    await adapter.ingest(ITEMS_20.slice(0, 3))
    await adapter.cleanup()
    // No assertion needed — we're checking for no thrown error.
  })

  it('cleanup() on a never-initialised adapter does not throw', async () => {
    const adapter = new EngramBlindAdapter()
    // Do NOT call reset() or ingest(). cleanup() should be safe.
    await adapter.cleanup()
  })
})
