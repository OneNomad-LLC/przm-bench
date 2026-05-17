import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ndcgAtK } from '../ndcg.js'

/**
 * NDCG textbook example verification:
 *
 * Given retrieved = ['a', 'b', 'c', 'd', 'e'] and expected = ['b', 'd'] at k=5:
 *
 *   Relevance:        a=0, b=1, c=0, d=1, e=0
 *   DCG@5:
 *     rank 1 (a): 0 / log2(2) = 0
 *     rank 2 (b): 1 / log2(3) ≈ 0.63093
 *     rank 3 (c): 0 / log2(4) = 0
 *     rank 4 (d): 1 / log2(5) ≈ 0.43067
 *     rank 5 (e): 0 / log2(6) = 0
 *     DCG@5 ≈ 0.63093 + 0.43067 = 1.06131 (approximately 1.0613)
 *
 *   IDCG@5 (ideal: both relevant items ranked 1st and 2nd):
 *     rank 1: 1 / log2(2) = 1.0
 *     rank 2: 1 / log2(3) ≈ 0.63093
 *     IDCG@5 ≈ 1.63093
 *
 *   NDCG@5 = 1.06131 / 1.63093 ≈ 0.6506
 */
const EPSILON = 1e-4

function approxEqual(actual: number, expected: number, eps = EPSILON): boolean {
  return Math.abs(actual - expected) <= eps
}

describe('ndcgAtK', () => {
  // ── Textbook example ────────────────────────────────────────────────

  it('matches textbook NDCG@5 for [a,b,c,d,e] with expected=[b,d]', () => {
    const result = ndcgAtK(['a', 'b', 'c', 'd', 'e'], ['b', 'd'], 5)
    // DCG = 1/log2(3) + 1/log2(5) ≈ 0.6309 + 0.4307 = 1.0613
    // IDCG = 1/log2(2) + 1/log2(3) = 1.0 + 0.6309 = 1.6309
    // NDCG = 1.0613 / 1.6309 ≈ 0.6506
    assert.ok(
      approxEqual(result, 0.6506, 1e-3),
      `Expected ~0.6506, got ${result}`,
    )
  })

  // ── Perfect ranking ─────────────────────────────────────────────────

  it('returns 1.0 for a perfect ranking (all expected at the top)', () => {
    // Only two relevant items; they are ranked 1st and 2nd.
    const result = ndcgAtK(['a', 'b', 'x', 'y'], ['a', 'b'], 4)
    assert.ok(approxEqual(result, 1.0), `Expected 1.0, got ${result}`)
  })

  it('returns 1.0 when there is one relevant item and it is ranked first', () => {
    const result = ndcgAtK(['a', 'b', 'c'], ['a'], 3)
    assert.ok(approxEqual(result, 1.0), `Expected 1.0, got ${result}`)
  })

  // ── Worst rankings ──────────────────────────────────────────────────

  it('returns 0 when no expected ID appears in the retrieved list', () => {
    assert.equal(ndcgAtK(['x', 'y', 'z'], ['a', 'b'], 5), 0)
  })

  it('returns less than 1.0 when the single relevant item is not ranked first', () => {
    // 'a' at rank 3 → DCG = 1/log2(4); IDCG = 1/log2(2) = 1.0
    // NDCG = (1/log2(4)) / 1.0 = 0.5
    const result = ndcgAtK(['x', 'y', 'a'], ['a'], 3)
    assert.ok(
      approxEqual(result, 0.5),
      `Expected 0.5, got ${result}`,
    )
  })

  // ── Empty expected ──────────────────────────────────────────────────

  it('returns 0 when expected is empty (no ground truth)', () => {
    assert.equal(ndcgAtK(['a', 'b', 'c'], [], 5), 0)
  })

  // ── K cutoff ────────────────────────────────────────────────────────

  it('ignores items ranked beyond K', () => {
    // 'b' is at rank 4; k=3 → not counted
    const miss = ndcgAtK(['x', 'y', 'z', 'b'], ['b'], 3)
    assert.equal(miss, 0)

    // 'b' is at rank 3; k=3 → counted
    const hit = ndcgAtK(['x', 'y', 'b'], ['b'], 3)
    assert.ok(hit > 0)
  })

  // ── Edge cases ──────────────────────────────────────────────────────

  it('returns 0 for empty retrieved list', () => {
    assert.equal(ndcgAtK([], ['a'], 5), 0)
  })

  it('handles k=1: only the first item matters', () => {
    assert.ok(approxEqual(ndcgAtK(['a', 'b'], ['a'], 1), 1.0))
    assert.equal(ndcgAtK(['b', 'a'], ['a'], 1), 0)
  })

  it('handles k larger than retrieved list length', () => {
    // Only one item retrieved, one expected, it matches → NDCG=1
    assert.ok(approxEqual(ndcgAtK(['a'], ['a'], 100), 1.0))
  })

  it('handles more expected items than retrieved (ideal is capped at k)', () => {
    // expected = 10 items, retrieved = ['a','b','c'], k=3
    // Only 'a' and 'c' happen to be in expected (ranks 1 and 3)
    // DCG = 1/log2(2) + 0 + 1/log2(4) = 1.0 + 0.5 = 1.5
    // IDCG (best 3 of 10 expected at top): 1/log2(2) + 1/log2(3) + 1/log2(4)
    //       = 1.0 + 0.6309 + 0.5 = 2.1309
    // NDCG = 1.5 / 2.1309 ≈ 0.7039
    const expected = ['a', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']
    const result = ndcgAtK(['a', 'b', 'c'], expected, 3)
    assert.ok(
      approxEqual(result, 0.7039, 1e-3),
      `Expected ~0.7039, got ${result}`,
    )
  })
})
