/**
 * recallAtK — binary recall for a single query.
 *
 * Returns 1 if any ID from `expected` appears in the first `k` entries of
 * `retrieved`, and 0 otherwise.
 *
 * IMPORTANT: This function must never be called with an empty `expected`
 * array. Queries with no expected IDs must be EXCLUDED from the benchmark
 * denominator before reaching here — not scored as 1.0 (the pre-fix engram
 * bug) and not scored as 0.0 (silently pessimistic). The `aggregateScores`
 * function enforces this exclusion. As a defensive measure, this function
 * returns 0 if `expected` is empty, but callers should never rely on that
 * path — see the regression test in __tests__/recall.test.ts.
 *
 * Bug history: engram's LongMemEval runner (benchmarks/longmemeval.ts) had
 * an earlier version that returned 1.0 for empty expected arrays, inflating
 * headline metrics. The fix was to exclude those questions from scoring
 * entirely. We codify that exclusion here at the aggregate level.
 */
export function recallAtK(
  retrieved: string[],
  expected: string[],
  k: number,
): number {
  // Defensive guard — see doc comment. Callers must exclude empty-expected
  // queries from the denominator rather than relying on this return value.
  if (expected.length === 0) return 0

  const topK = new Set(retrieved.slice(0, k))
  for (const id of expected) {
    if (topK.has(id)) return 1
  }
  return 0
}
