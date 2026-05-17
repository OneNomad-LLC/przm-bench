/**
 * Nearest-rank percentile.
 *
 * Uses the nearest-rank method:
 *   rank = ceil(p/100 * n)
 *   result = sorted_values[rank - 1]
 *
 * Edge cases:
 *   - Empty array: returns 0
 *   - Single value: always returns that value regardless of p
 *   - p=0: returns the minimum (rank clamped to 1)
 *   - p=100: returns the maximum
 *
 * @param values - Array of numeric latency values in milliseconds. Not
 *   mutated; sorted internally.
 * @param p - Percentile in [0, 100].
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]!

  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length

  // Nearest-rank: rank = ceil(p/100 * n), clamped to [1, n]
  const rank = Math.max(1, Math.ceil((p / 100) * n))
  return sorted[Math.min(rank, n) - 1]!
}
