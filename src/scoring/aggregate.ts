import type { PerQueryResult, Scores } from '../types.js'
import type { FixtureQuery } from '../types.js'
import { recallAtK } from './recall.js'
import { ndcgAtK } from './ndcg.js'
import { percentile } from './latency.js'

/**
 * Compose per-query results into the final `Scores` object.
 *
 * Empty-expected exclusion: queries whose `expectedAnswerIds` is empty are
 * excluded from recall and NDCG denominators. They ARE included in latency
 * percentile calculations (the latency was real regardless of ground truth).
 *
 * The caller must pass the `fixtureQueries` array so we can inspect
 * `expectedAnswerIds` — `PerQueryResult` deliberately omits that field
 * (it would duplicate the fixture data on every result row).
 *
 * @param perQueryResults - Per-query output from the runner loop.
 * @param fixtureQueries - The fixture.queries array (same order/length as perQueryResults).
 * @param ingestThroughput - Items-per-second from the ingest phase.
 */
export function aggregateScores(
  perQueryResults: PerQueryResult[],
  fixtureQueries: FixtureQuery[],
  ingestThroughput: number,
): Scores {
  const latencies = perQueryResults.map((r) => r.latencyMs)

  // Partition into scoreable (has expected IDs) vs excluded
  let recall5Sum = 0
  let recall10Sum = 0
  let ndcg10Sum = 0
  let scoreableCount = 0

  for (let i = 0; i < perQueryResults.length; i++) {
    const result = perQueryResults[i]!
    const query = fixtureQueries[i]!
    const expected = query.expectedAnswerIds

    // Queries with empty expected arrays are excluded from the
    // recall/NDCG denominators. See recall.ts for the full rationale.
    if (expected.length === 0) continue

    scoreableCount++
    recall5Sum += recallAtK(result.retrieved, expected, 5)
    recall10Sum += recallAtK(result.retrieved, expected, 10)
    ndcg10Sum += ndcgAtK(result.retrieved, expected, 10)
  }

  const recall5 = scoreableCount === 0 ? 0 : recall5Sum / scoreableCount
  const recall10 = scoreableCount === 0 ? 0 : recall10Sum / scoreableCount
  const ndcg10 = scoreableCount === 0 ? 0 : ndcg10Sum / scoreableCount

  return {
    recall_at_5: recall5,
    recall_at_10: recall10,
    ndcg_at_10: ndcg10,
    latency_p50_ms: percentile(latencies, 50),
    latency_p95_ms: percentile(latencies, 95),
    ingest_throughput_items_per_sec: ingestThroughput,
  }
}
