/**
 * @onenomad/bench — public API surface.
 *
 * Import this package to run benchmarks programmatically or to build
 * custom adapters and fixtures.
 *
 * Note on receipt/index.ts: the signing and verification surface is
 * owned by a separate track (feat/receipt-signing) and has not yet
 * merged. The import below is commented out with a TODO so the package
 * builds standalone on this branch.
 *
 * TODO(integration): uncomment when feat/receipt-signing merges:
 *   export * from './receipt/index.js'
 */

// ── Runner ────────────────────────────────────────────────────────────
export { runBenchmark } from './runner.js'
export type { RunBenchmarkOptions, RunBenchmarkResult } from './runner.js'

// ── Fixtures ──────────────────────────────────────────────────────────
export { loadFixture, loadFixturesDir, loadFixtureSync, hashFixture } from './fixtures.js'

// ── Scoring ───────────────────────────────────────────────────────────
export { recallAtK } from './scoring/recall.js'
export { ndcgAtK } from './scoring/ndcg.js'
export { percentile } from './scoring/latency.js'
export { aggregateScores } from './scoring/aggregate.js'

// ── Types (re-export everything from types.ts) ────────────────────────
export type {
  MemoryItem,
  RetrievedItem,
  QueryOptions,
  Adapter,
  FixtureItem,
  FixtureQuery,
  Fixture,
  PerQueryResult,
  Scores,
  Receipt,
} from './types.js'

export {
  MemoryItemSchema,
  RetrievedItemSchema,
  FixtureItemSchema,
  FixtureQuerySchema,
  FixtureSchema,
  ReceiptSchema,
} from './types.js'
