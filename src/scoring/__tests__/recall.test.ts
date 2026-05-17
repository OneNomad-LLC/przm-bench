import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { recallAtK } from '../recall.js'

describe('recallAtK', () => {
  // ── Basic hit / miss ────────────────────────────────────────────────

  it('returns 1 when the first expected ID appears in top-K', () => {
    assert.equal(recallAtK(['a', 'b', 'c'], ['a'], 3), 1)
  })

  it('returns 1 when a later expected ID appears within top-K', () => {
    assert.equal(recallAtK(['x', 'y', 'b', 'z'], ['b'], 4), 1)
  })

  it('returns 0 when no expected ID appears in top-K', () => {
    assert.equal(recallAtK(['x', 'y', 'z'], ['a'], 3), 0)
  })

  it('respects the K cutoff — ID at rank K+1 is not counted', () => {
    // 'a' is at index 3 (rank 4); k=3 → not counted
    assert.equal(recallAtK(['x', 'y', 'z', 'a'], ['a'], 3), 0)
  })

  it('respects the K cutoff — ID at rank K is counted', () => {
    // 'a' is at index 2 (rank 3); k=3 → counted
    assert.equal(recallAtK(['x', 'y', 'a'], ['a'], 3), 1)
  })

  // ── Multiple expected IDs ───────────────────────────────────────────

  it('returns 1 if any one of multiple expected IDs is in top-K', () => {
    assert.equal(recallAtK(['x', 'b', 'z'], ['a', 'b', 'c'], 3), 1)
  })

  it('returns 1 even if only the last expected ID is in top-K', () => {
    assert.equal(recallAtK(['x', 'c', 'y'], ['a', 'b', 'c'], 5), 1)
  })

  it('returns 0 when none of multiple expected IDs appear in top-K', () => {
    assert.equal(recallAtK(['x', 'y', 'z'], ['a', 'b', 'c'], 3), 0)
  })

  // ── REGRESSION GUARD: empty expected must NOT return 1.0 ────────────
  //
  // Engram's LongMemEval runner had a version where an empty `relevant`
  // array caused the function to return 1 (auto-hit), silently inflating
  // headline metrics by the number of questions with no answer_session_ids.
  //
  // The correct fix is to EXCLUDE such queries from the denominator at the
  // aggregateScores level. recallAtK itself returns 0 as a defensive
  // fallback — but callers must never rely on that 0 either; they must
  // exclude the query entirely. aggregateScores enforces this.
  //
  // This test is the regression guard: empty expected → 0, never 1.
  it('REGRESSION: returns 0 (not 1) when expected is empty', () => {
    assert.equal(
      recallAtK(['a', 'b', 'c'], [], 10),
      0,
      'empty expected must return 0, not 1 — see engram pre-fix bug',
    )
  })

  it('REGRESSION: returns 0 for empty expected even with matching IDs that cannot be known', () => {
    // No expected IDs means there is no correct answer to recall.
    // A non-zero return here would be meaningless.
    assert.equal(recallAtK(['id-1', 'id-2'], [], 5), 0)
  })

  // ── Edge cases ──────────────────────────────────────────────────────

  it('returns 0 when retrieved list is empty', () => {
    assert.equal(recallAtK([], ['a'], 10), 0)
  })

  it('returns 0 when both lists are empty', () => {
    assert.equal(recallAtK([], [], 10), 0)
  })

  it('handles k=1 correctly (only the top result counts)', () => {
    assert.equal(recallAtK(['a', 'b'], ['b'], 1), 0)
    assert.equal(recallAtK(['b', 'a'], ['b'], 1), 1)
  })

  it('handles k larger than retrieved list length without panic', () => {
    assert.equal(recallAtK(['a'], ['a'], 100), 1)
    assert.equal(recallAtK(['x'], ['a'], 100), 0)
  })
})
