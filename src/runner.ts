import type { Adapter, Fixture, PerQueryResult, Scores } from './types.js'
import { aggregateScores } from './scoring/aggregate.js'

export interface RunBenchmarkOptions {
  adapter: Adapter
  fixture: Fixture
  /** K value for recall. Recall@5 and Recall@10 are always computed;
   *  this setting is unused — both are derived inside aggregateScores. */
  kForRecall?: number
}

export interface RunBenchmarkResult {
  scores: Scores
  perQuery: PerQueryResult[]
}

/**
 * Run one fixture against one adapter and return scores + per-query detail.
 *
 * The runner is intentionally thin:
 *  - It owns the ingest timing and per-query latency timing.
 *  - It does NOT sign the receipt (CI signs after the run).
 *  - It does NOT write files (the CLI layer does that).
 *
 * Lifecycle:
 *  1. adapter.reset() — wipe all prior state.
 *  2. adapter.ingest(fixture.items) — bulk load, measured for throughput.
 *  3. For each query: measure wall-clock latency, call adapter.query,
 *     determine hit + first matching rank.
 *  4. aggregateScores — compose into the Scores shape.
 *  5. adapter.cleanup?.() — release DB connections, subprocesses, etc.
 */
export async function runBenchmark(
  opts: RunBenchmarkOptions,
): Promise<RunBenchmarkResult> {
  const { adapter, fixture } = opts

  // 1. Wipe state for a clean run.
  await adapter.reset()

  // 2. Ingest — measure throughput.
  const ingestStart = Date.now()
  await adapter.ingest(fixture.items)
  const ingestMs = Date.now() - ingestStart
  const ingestThroughput =
    ingestMs === 0 ? Infinity : (fixture.items.length / ingestMs) * 1_000

  // 3. Query loop.
  const perQuery: PerQueryResult[] = []

  for (const q of fixture.queries) {
    const queryStart = Date.now()
    const retrieved = await adapter.query(q.query, {
      k: 10,
      when: q.when != null ? new Date(q.when) : undefined,
    })
    const latencyMs = Date.now() - queryStart

    const retrievedIds = retrieved.map((r) => r.id)
    const expectedSet = new Set(q.expectedAnswerIds)

    // Binary hit: any expected ID in the full retrieved list (up to k=10)
    let hit = false
    let rank: number | null = null
    for (let i = 0; i < retrievedIds.length; i++) {
      if (expectedSet.has(retrievedIds[i]!)) {
        hit = true
        rank = i + 1 // 1-indexed
        break
      }
    }

    perQuery.push({
      queryId: q.id,
      retrieved: retrievedIds,
      hit,
      rank,
      latencyMs,
    })
  }

  // 4. Compose scores — pass fixture.queries so aggregateScores can
  //    inspect expectedAnswerIds for the empty-expected exclusion rule.
  const scores = aggregateScores(perQuery, fixture.queries, ingestThroughput)

  // 5. Optional cleanup (close connections, kill sub-processes).
  await adapter.cleanup?.()

  return { scores, perQuery }
}
