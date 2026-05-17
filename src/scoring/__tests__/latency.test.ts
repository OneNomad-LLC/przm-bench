import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { percentile } from '../latency.js'

describe('percentile', () => {
  // ── Edge cases ──────────────────────────────────────────────────────

  it('returns 0 for an empty array', () => {
    assert.equal(percentile([], 50), 0)
    assert.equal(percentile([], 95), 0)
    assert.equal(percentile([], 0), 0)
  })

  it('returns the only value for a single-element array regardless of p', () => {
    assert.equal(percentile([42], 0), 42)
    assert.equal(percentile([42], 50), 42)
    assert.equal(percentile([42], 95), 42)
    assert.equal(percentile([42], 100), 42)
  })

  // ── Sorting: input order must not affect result ──────────────────────

  it('sorts internally — returns the same result for any input order', () => {
    const sorted = percentile([10, 20, 30, 40, 50], 50)
    const reversed = percentile([50, 40, 30, 20, 10], 50)
    const shuffled = percentile([30, 10, 50, 20, 40], 50)
    assert.equal(sorted, reversed)
    assert.equal(sorted, shuffled)
  })

  it('does not mutate the input array', () => {
    const input = [50, 10, 30, 20, 40]
    const copy = [...input]
    percentile(input, 50)
    assert.deepEqual(input, copy)
  })

  // ── Nearest-rank correctness ─────────────────────────────────────────
  //
  // Nearest-rank formula: rank = ceil(p/100 * n), clamped to [1, n].
  // Result = sorted[rank - 1]
  //
  // For n=10, sorted = [1,2,3,4,5,6,7,8,9,10]:
  //   p=0  → rank=ceil(0)=0 → clamped to 1 → sorted[0] = 1
  //   p=50 → rank=ceil(5)=5 → sorted[4] = 5
  //   p=90 → rank=ceil(9)=9 → sorted[8] = 9
  //   p=95 → rank=ceil(9.5)=10 → sorted[9] = 10
  //   p=100→ rank=ceil(10)=10 → sorted[9] = 10

  const tenValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  it('p0 returns the minimum (rank clamped to 1)', () => {
    assert.equal(percentile(tenValues, 0), 1)
  })

  it('p50 on 10 values returns the 5th sorted value', () => {
    assert.equal(percentile(tenValues, 50), 5)
  })

  it('p90 on 10 values returns the 9th sorted value', () => {
    assert.equal(percentile(tenValues, 90), 9)
  })

  it('p95 on 10 values returns the 10th sorted value (rounds up)', () => {
    assert.equal(percentile(tenValues, 95), 10)
  })

  it('p100 returns the maximum', () => {
    assert.equal(percentile(tenValues, 100), 10)
    assert.equal(percentile([7, 2, 99, 1], 100), 99)
  })

  // ── Two-element array ────────────────────────────────────────────────

  it('p50 on [100, 200] returns 100 (rank=ceil(1)=1)', () => {
    // n=2: p50 → rank=ceil(1)=1 → sorted[0]=100
    assert.equal(percentile([200, 100], 50), 100)
  })

  it('p100 on [100, 200] returns 200', () => {
    assert.equal(percentile([100, 200], 100), 200)
  })

  // ── Realistic latency distribution ───────────────────────────────────

  it('p95 is higher than p50 on a realistic distribution', () => {
    // Simulated latency values in ms
    const latencies = [10, 12, 15, 11, 13, 14, 80, 9, 11, 12, 200, 11, 13, 14, 10,
      12, 11, 14, 13, 15]
    const p50 = percentile(latencies, 50)
    const p95 = percentile(latencies, 95)
    assert.ok(p95 >= p50, `p95 (${p95}) must be >= p50 (${p50})`)
    assert.ok(p95 > 50, 'p95 should catch the tail outliers (80ms, 200ms)')
  })

  // ── Non-integer percentiles ──────────────────────────────────────────

  it('handles non-integer p values via ceil', () => {
    // n=4, p=37.5: rank=ceil(1.5)=2 → sorted[1]
    const result = percentile([40, 10, 30, 20], 37.5)
    // sorted=[10,20,30,40], rank=2, result=20
    assert.equal(result, 20)
  })
})
