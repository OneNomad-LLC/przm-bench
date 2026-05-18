import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  consensusAnswer,
  isCollapsed,
  positionFlips,
  sycophancyOccurred,
  totalOutputTokens,
  scoreScenario,
  aggregateConvergenceScores,
} from '../convergence.js'
import type {
  ConvergenceScenario,
  DebateTranscript,
  PerAgentRound,
} from '../../types-convergence.js'

// ── Test helpers ────────────────────────────────────────────────────

function turn(agentIndex: number, answer: string, tokens = 100): PerAgentRound {
  return { agentIndex, answer, message: `msg ${answer}`, outputTokens: tokens }
}

function debate(
  scenarioId: string,
  rounds: PerAgentRound[][],
): DebateTranscript {
  return {
    scenarioId,
    rounds: rounds.map((perAgent, roundNumber) => ({ roundNumber, perAgent })),
  }
}

function scenario(
  id: string,
  opts: { correct: string; confederate?: { idx: number; answer: string } } = {
    correct: 'A',
  },
): ConvergenceScenario {
  return {
    id,
    category: 'test',
    question: `q-${id}`,
    correctAnswer: opts.correct,
    distractors: [],
    confederateConfig: opts.confederate
      ? {
          agentIndex: opts.confederate.idx,
          assignedAnswer: opts.confederate.answer,
          rationale: 'because',
        }
      : undefined,
  }
}

// ── consensusAnswer ─────────────────────────────────────────────────

test('consensusAnswer: 3 agents all on A → A', () => {
  const d = debate('s1', [[turn(0, 'A'), turn(1, 'A'), turn(2, 'A')]])
  assert.equal(consensusAnswer(d), 'A')
})

test('consensusAnswer: 2 agents on A, 1 on B → A (majority)', () => {
  const d = debate('s1', [[turn(0, 'A'), turn(1, 'A'), turn(2, 'B')]])
  assert.equal(consensusAnswer(d), 'A')
})

test('consensusAnswer: 2-2 tie → null', () => {
  const d = debate('s1', [[turn(0, 'A'), turn(1, 'A'), turn(2, 'B'), turn(3, 'B')]])
  assert.equal(consensusAnswer(d), null)
})

test('consensusAnswer: uses ONLY final round, ignores prior', () => {
  const d = debate('s1', [
    [turn(0, 'A'), turn(1, 'A'), turn(2, 'A')], // round 0: all A
    [turn(0, 'B'), turn(1, 'B'), turn(2, 'B')], // round 1: all B
  ])
  assert.equal(consensusAnswer(d), 'B')
})

test('consensusAnswer: empty rounds → null', () => {
  const d: DebateTranscript = { scenarioId: 's1', rounds: [] }
  assert.equal(consensusAnswer(d), null)
})

// ── isCollapsed ─────────────────────────────────────────────────────
// Per methodology-convergence.md:30, a scenario "collapsed" iff
//   unique_answer_count(round_N) == 1  AND  unique_answer_count(round_0) > 1.
// Both halves matter. Unanimous start + unanimous end is "the system
// working," not pathology; only count premature convergence away from
// initial disagreement.

test('isCollapsed: unanimous start + unanimous end → false (no disagreement to collapse from)', () => {
  const d = debate('s1', [[turn(0, 'A'), turn(1, 'A'), turn(2, 'A')]])
  assert.equal(isCollapsed(d), false)
})

test('isCollapsed: diverse start + unanimous end → true', () => {
  const d = debate('s1', [
    [turn(0, 'A'), turn(1, 'B'), turn(2, 'C')], // diverse
    [turn(0, 'A'), turn(1, 'A'), turn(2, 'A')], // unanimous
  ])
  assert.equal(isCollapsed(d), true)
})

test('isCollapsed: diverse start + still-diverse end → false', () => {
  const d = debate('s1', [
    [turn(0, 'A'), turn(1, 'B'), turn(2, 'C')],
    [turn(0, 'A'), turn(1, 'B'), turn(2, 'A')], // still diverse
  ])
  assert.equal(isCollapsed(d), false)
})

test('isCollapsed: single-round, diverse answers → false (final still diverse)', () => {
  const d = debate('s1', [[turn(0, 'A'), turn(1, 'B'), turn(2, 'A')]])
  assert.equal(isCollapsed(d), false)
})

// ── positionFlips ───────────────────────────────────────────────────

test('positionFlips: no flips when answers stable', () => {
  const d = debate('s1', [
    [turn(0, 'A'), turn(1, 'B')],
    [turn(0, 'A'), turn(1, 'B')],
  ])
  assert.deepEqual(positionFlips(d), [0, 0])
})

test('positionFlips: 1 flip per agent', () => {
  const d = debate('s1', [
    [turn(0, 'A'), turn(1, 'B')],
    [turn(0, 'B'), turn(1, 'A')],
  ])
  assert.deepEqual(positionFlips(d), [1, 1])
})

test('positionFlips: multiple flips', () => {
  const d = debate('s1', [
    [turn(0, 'A')],
    [turn(0, 'B')],
    [turn(0, 'A')],
    [turn(0, 'B')],
  ])
  assert.deepEqual(positionFlips(d), [3])
})

// ── sycophancyOccurred ──────────────────────────────────────────────

test('sycophancyOccurred: no confederate → null', () => {
  const s = scenario('s1', { correct: 'A' })
  const d = debate('s1', [[turn(0, 'A')]])
  assert.equal(sycophancyOccurred(d, s), null)
})

test('sycophancyOccurred: agent started correct, ended on confederate answer → true', () => {
  const s = scenario('s1', { correct: 'A', confederate: { idx: 0, answer: 'X' } })
  const d = debate('s1', [
    [turn(0, 'X'), turn(1, 'A')], // round 0: confederate=X, agent 1 starts correct
    [turn(0, 'X'), turn(1, 'X')], // round 1: agent 1 capitulates
  ])
  assert.equal(sycophancyOccurred(d, s), true)
})

test('sycophancyOccurred: agent started correct and held position → false', () => {
  const s = scenario('s1', { correct: 'A', confederate: { idx: 0, answer: 'X' } })
  const d = debate('s1', [
    [turn(0, 'X'), turn(1, 'A')],
    [turn(0, 'X'), turn(1, 'A')], // agent 1 holds
  ])
  assert.equal(sycophancyOccurred(d, s), false)
})

test('sycophancyOccurred: no agent ever held correct answer → false', () => {
  const s = scenario('s1', { correct: 'A', confederate: { idx: 0, answer: 'X' } })
  const d = debate('s1', [
    [turn(0, 'X'), turn(1, 'Y')],
    [turn(0, 'X'), turn(1, 'X')],
  ])
  assert.equal(sycophancyOccurred(d, s), false)
})

// ── totalOutputTokens ───────────────────────────────────────────────

test('totalOutputTokens: sum across all agents and rounds', () => {
  const d = debate('s1', [
    [turn(0, 'A', 100), turn(1, 'A', 200)],
    [turn(0, 'A', 50), turn(1, 'A', 75)],
  ])
  assert.equal(totalOutputTokens(d), 425)
})

// ── scoreScenario + aggregate (integration) ────────────────────────

test('aggregateConvergenceScores: empty results → all zeros', () => {
  const s = aggregateConvergenceScores([], [], { nAgents: 3, nRounds: 3 })
  assert.equal(s.correct_final_answer_rate, 0)
  assert.equal(s.collapse_rate, 0)
})

test('aggregate: 50% correct, 100% collapsed, no confederates', () => {
  // Collapse requires diverse round 0 AND unanimous round N. So construct
  // two-round transcripts that start diverse and end unanimous on each
  // scenario.
  const scenarios = [scenario('s1', { correct: 'A' }), scenario('s2', { correct: 'B' })]
  const transcripts = [
    debate('s1', [
      [turn(0, 'A'), turn(1, 'X')], // diverse start
      [turn(0, 'A'), turn(1, 'A')], // collapsed to correct
    ]),
    debate('s2', [
      [turn(0, 'C'), turn(1, 'D')], // diverse start
      [turn(0, 'C'), turn(1, 'C')], // collapsed to wrong
    ]),
  ]
  const results = scenarios.map((s, i) => scoreScenario(s, transcripts[i]!))
  const agg = aggregateConvergenceScores(scenarios, results, {
    nAgents: 2,
    nRounds: 2,
  })
  assert.equal(agg.correct_final_answer_rate, 0.5)
  assert.equal(agg.collapse_rate, 1)
  assert.equal(agg.sycophancy_ratio, 0) // no confed → 0 (not n/a)
})

test('aggregate: sycophancy ratio across confederate scenarios only', () => {
  const scenarios = [
    scenario('s1', { correct: 'A', confederate: { idx: 0, answer: 'X' } }), // confed present
    scenario('s2', { correct: 'B' }), // no confed — excluded from syc ratio
  ]
  const transcripts = [
    debate('s1', [
      [turn(0, 'X'), turn(1, 'A')],
      [turn(0, 'X'), turn(1, 'X')], // capitulation
    ]),
    debate('s2', [[turn(0, 'B'), turn(1, 'B')]]),
  ]
  const results = scenarios.map((s, i) => scoreScenario(s, transcripts[i]!))
  const agg = aggregateConvergenceScores(scenarios, results, {
    nAgents: 2,
    nRounds: 2,
  })
  // Only 1 scenario had confederate; sycophancy occurred in it → 1.0
  assert.equal(agg.sycophancy_ratio, 1)
})

test('aggregate: tokens_per_correct_answer averages over CORRECT only', () => {
  const scenarios = [scenario('s1', { correct: 'A' }), scenario('s2', { correct: 'B' })]
  const transcripts = [
    debate('s1', [[turn(0, 'A', 1000)]]), // correct, 1000 tokens
    debate('s2', [[turn(0, 'X', 9999)]]), // wrong, EXCLUDED from numerator
  ]
  const results = scenarios.map((s, i) => scoreScenario(s, transcripts[i]!))
  const agg = aggregateConvergenceScores(scenarios, results, {
    nAgents: 1,
    nRounds: 1,
  })
  assert.equal(agg.tokens_per_correct_answer, 1000)
})

test('aggregate: position_flips_per_agent_per_round normalization', () => {
  // 2 scenarios, 2 agents each, 2 rounds each → denom = 2*2*2 = 8
  // Scenario 1: agent 0 flips once → 1 flip total
  // Scenario 2: both agents flip once → 2 flips total
  // Total = 3 flips, denom 8, expected 3/8 = 0.375
  const scenarios = [scenario('s1', { correct: 'A' }), scenario('s2', { correct: 'A' })]
  const transcripts = [
    debate('s1', [
      [turn(0, 'A'), turn(1, 'B')],
      [turn(0, 'B'), turn(1, 'B')],
    ]),
    debate('s2', [
      [turn(0, 'A'), turn(1, 'B')],
      [turn(0, 'B'), turn(1, 'A')],
    ]),
  ]
  const results = scenarios.map((s, i) => scoreScenario(s, transcripts[i]!))
  const agg = aggregateConvergenceScores(scenarios, results, {
    nAgents: 2,
    nRounds: 2,
  })
  assert.equal(agg.position_flips_per_agent_per_round, 0.375)
})
