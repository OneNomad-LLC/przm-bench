import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import {
  loadAllConvergenceScenarios,
  hashScenario,
} from '../fixtures-convergence.js'

const FIXTURES_ROOT = join(process.cwd(), 'fixtures', 'convergence')

test('shipped fixtures: every file passes schema validation', async () => {
  const scenarios = await loadAllConvergenceScenarios(FIXTURES_ROOT)
  assert.ok(scenarios.length >= 8, `expected ≥8 seed scenarios, got ${scenarios.length}`)
  for (const s of scenarios) {
    assert.ok(s.id.length > 0, `scenario missing id`)
    assert.ok(s.question.length > 0, `${s.id} missing question`)
    assert.ok(s.correctAnswer.length > 0, `${s.id} missing correctAnswer`)
  }
})

test('shipped fixtures: ids are globally unique', async () => {
  const scenarios = await loadAllConvergenceScenarios(FIXTURES_ROOT)
  const ids = scenarios.map((s) => s.id)
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
  assert.deepEqual(dupes, [], `duplicate scenario ids: ${dupes.join(', ')}`)
})

test('shipped fixtures: every confederate.agentIndex is in [0, 4]', async () => {
  // Default debate runs use nAgents in {3, 4, 5}. Confederate index must
  // be < min(nAgents). 0-4 covers up to 5 agents.
  const scenarios = await loadAllConvergenceScenarios(FIXTURES_ROOT)
  for (const s of scenarios) {
    if (!s.confederateConfig) continue
    const idx = s.confederateConfig.agentIndex
    assert.ok(
      idx >= 0 && idx <= 4,
      `${s.id}: confederate agentIndex ${idx} out of expected range [0,4]`,
    )
  }
})

test('shipped fixtures: confederate.assignedAnswer is always in distractors', async () => {
  // Sanity: a confederate's wrong answer should be a *plausible* wrong
  // answer, so it should appear in the scenario's distractor list.
  const scenarios = await loadAllConvergenceScenarios(FIXTURES_ROOT)
  for (const s of scenarios) {
    if (!s.confederateConfig) continue
    assert.ok(
      s.distractors.includes(s.confederateConfig.assignedAnswer),
      `${s.id}: confederate.assignedAnswer "${s.confederateConfig.assignedAnswer}" not in distractors`,
    )
  }
})

test('shipped fixtures: confederate.assignedAnswer never equals correctAnswer', async () => {
  const scenarios = await loadAllConvergenceScenarios(FIXTURES_ROOT)
  for (const s of scenarios) {
    if (!s.confederateConfig) continue
    assert.notEqual(
      s.confederateConfig.assignedAnswer,
      s.correctAnswer,
      `${s.id}: confederate answer equals correct answer — confederate cannot be wrong`,
    )
  }
})

test('hashScenario: deterministic across calls', async () => {
  const scenarios = await loadAllConvergenceScenarios(FIXTURES_ROOT)
  for (const s of scenarios) {
    assert.equal(hashScenario(s), hashScenario(s))
  }
})

test('hashScenario: key-order independent', () => {
  const a = {
    id: 'x-1',
    category: 'test',
    question: 'q',
    correctAnswer: 'a',
    distractors: ['b'],
  } as any
  const b = {
    distractors: ['b'],
    correctAnswer: 'a',
    question: 'q',
    category: 'test',
    id: 'x-1',
  } as any
  assert.equal(hashScenario(a), hashScenario(b))
})
