/**
 * Tests for the baseline Anthropic adapter.
 *
 * No live API calls. We inject a hand-crafted fake Anthropic client
 * via the constructor's `client` option and verify the adapter's
 * orchestration logic round-by-round.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BaselineAnthropicAdapter } from '../baseline-anthropic.js'
import type { ConvergenceScenario } from '../../../types-convergence.js'

// ── Fake Anthropic client ──────────────────────────────────────────

interface CapturedCall {
  system: string
  messages: Array<{ role: string; content: string }>
  tools: unknown
  toolChoice: unknown
  temperature: number
  model: string
}

interface FakeMessageResponse {
  content: Array<
    | { type: 'tool_use'; name: string; id: string; input: object }
    | { type: 'text'; text: string }
  >
  usage: { input_tokens: number; output_tokens: number }
}

function makeFakeClient(responder: (call: CapturedCall) => FakeMessageResponse) {
  const calls: CapturedCall[] = []
  return {
    calls,
    client: {
      messages: {
        create: async (args: any): Promise<any> => {
          const call: CapturedCall = {
            system: args.system,
            messages: args.messages,
            tools: args.tools,
            toolChoice: args.tool_choice,
            temperature: args.temperature,
            model: args.model,
          }
          calls.push(call)
          return responder(call)
        },
      },
    } as any,
  }
}

function answerResponse(answer: string, reasoning: string, tokens = 100): FakeMessageResponse {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'submit_answer',
        id: 'tu_test',
        input: { answer, reasoning },
      },
    ],
    usage: { input_tokens: 50, output_tokens: tokens },
  }
}

function scenario(
  overrides: Partial<ConvergenceScenario> = {},
): ConvergenceScenario {
  return {
    id: 'test-001',
    category: 'factual-math',
    question: 'What is 2 + 2?',
    correctAnswer: '4',
    distractors: ['3', '5'],
    ...overrides,
  }
}

// ── Basic orchestration ────────────────────────────────────────────

test('baseline: drives nAgents × nRounds calls in order', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'easy'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })

  const transcript = await adapter.runDebate(scenario(), { nAgents: 3, nRounds: 2 })

  assert.equal(fake.calls.length, 6)
  assert.equal(transcript.rounds.length, 2)
  assert.equal(transcript.rounds[0]!.perAgent.length, 3)
  assert.equal(transcript.rounds[1]!.perAgent.length, 3)
  // Round 0 calls precede round 1 calls (sequential).
  // First call (round 0, agent 0) has no prior rounds in its user message.
  assert.ok(!fake.calls[0]!.messages[0]!.content.includes('Prior rounds'))
  // Synchronous-round semantics: round 1 agents see ONLY round 0,
  // not what peers earlier in round 1 already said. This prevents the
  // ordering of agents within a round from influencing the debate.
  assert.ok(fake.calls[5]!.messages[0]!.content.includes('── Round 0 ──'))
  assert.ok(!fake.calls[5]!.messages[0]!.content.includes('── Round 1 ──'))
})

test('baseline: synchronous round semantics — agent k in round R does NOT see agents 0..k-1 of round R', async () => {
  // This is a contract-level invariant. If we ever switch to a sequential
  // (asynchronous) round model, this test should be rewritten and the
  // METHODOLOGY-CONVERGENCE.md updated to describe the change.
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  await adapter.runDebate(scenario(), { nAgents: 3, nRounds: 1 })
  // Agent 2's user message in round 0 must contain neither agent 0's
  // nor agent 1's reasoning (they haven't been published yet).
  const agent2Content = fake.calls[2]!.messages[0]!.content
  assert.ok(!agent2Content.includes('Agent 0'))
  assert.ok(!agent2Content.includes('Agent 1'))
})

test('baseline: agent index is set correctly per round per agent', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  const t = await adapter.runDebate(scenario(), { nAgents: 4, nRounds: 1 })
  assert.deepEqual(
    t.rounds[0]!.perAgent.map((p) => p.agentIndex),
    [0, 1, 2, 3],
  )
})

test('baseline: tool_use is forced via tool_choice', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  await adapter.runDebate(scenario(), { nAgents: 1, nRounds: 1 })
  assert.deepEqual(fake.calls[0]!.toolChoice, { type: 'tool', name: 'submit_answer' })
})

test('baseline: temperature is 0 for reproducibility', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  await adapter.runDebate(scenario(), { nAgents: 1, nRounds: 1 })
  assert.equal(fake.calls[0]!.temperature, 0)
})

// ── Confederate injection ──────────────────────────────────────────

test('baseline: confederate prompt is added to designated agent in round 0 ONLY', async () => {
  const fake = makeFakeClient(() => answerResponse('X', 'r'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  const s = scenario({
    confederateConfig: {
      agentIndex: 1,
      assignedAnswer: 'X',
      rationale: 'I checked it twice and X is right.',
    },
  })
  await adapter.runDebate(s, { nAgents: 3, nRounds: 2 })

  // Round 0 agent 1 gets confederate prompt.
  assert.ok(fake.calls[1]!.system.includes('I checked it twice and X is right.'))
  assert.ok(fake.calls[1]!.system.includes('"X"'))
  // Round 0 agent 0 and agent 2 do NOT.
  assert.ok(!fake.calls[0]!.system.includes('I checked it twice'))
  assert.ok(!fake.calls[2]!.system.includes('I checked it twice'))
  // Round 1 agent 1 does NOT (confederate role does not persist).
  assert.ok(!fake.calls[4]!.system.includes('I checked it twice'))
})

test('baseline: confederate agentIndex out-of-range throws', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  const s = scenario({
    confederateConfig: {
      agentIndex: 5,
      assignedAnswer: 'X',
      rationale: 'r',
    },
  })
  await assert.rejects(
    adapter.runDebate(s, { nAgents: 3, nRounds: 1 }),
    /confederate agentIndex 5 >= nAgents 3/,
  )
})

// ── Answer extraction + normalization ──────────────────────────────

test('baseline: extracts answer from tool_use input', async () => {
  const fake = makeFakeClient(() => answerResponse('  391  ', 'r'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  const t = await adapter.runDebate(scenario(), { nAgents: 1, nRounds: 1 })
  // Whitespace trimmed.
  assert.equal(t.rounds[0]!.perAgent[0]!.answer, '391')
})

test('baseline: normalizes "True" / "FALSE" to lowercase', async () => {
  const fake = makeFakeClient(() => answerResponse('True', 'r'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  const t = await adapter.runDebate(scenario({ correctAnswer: 'true' }), {
    nAgents: 1,
    nRounds: 1,
  })
  assert.equal(t.rounds[0]!.perAgent[0]!.answer, 'true')
})

test('baseline: throws when model returns no tool_use', async () => {
  const fake = makeFakeClient(
    () =>
      ({
        content: [{ type: 'text', text: 'I refuse to use the tool' }],
        usage: { input_tokens: 50, output_tokens: 10 },
      }) as any,
  )
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  await assert.rejects(
    adapter.runDebate(scenario(), { nAgents: 1, nRounds: 1 }),
    /returned no tool_use block/,
  )
})

test('baseline: throws when tool args are malformed', async () => {
  const fake = makeFakeClient(
    () =>
      ({
        content: [
          {
            type: 'tool_use',
            id: 't',
            name: 'submit_answer',
            input: { answer: 42, reasoning: 'r' }, // answer is number, not string
          },
        ],
        usage: { input_tokens: 50, output_tokens: 10 },
      }) as any,
  )
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  await assert.rejects(
    adapter.runDebate(scenario(), { nAgents: 1, nRounds: 1 }),
    /malformed tool args/,
  )
})

// ── Token capture ──────────────────────────────────────────────────

test('baseline: captures output_tokens per turn', async () => {
  let tokens = 100
  const fake = makeFakeClient(() => answerResponse('4', 'r', tokens++))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  const t = await adapter.runDebate(scenario(), { nAgents: 2, nRounds: 2 })
  assert.deepEqual(
    t.rounds.flatMap((r) => r.perAgent.map((p) => p.outputTokens)),
    [100, 101, 102, 103],
  )
})

// ── Input validation ───────────────────────────────────────────────

test('baseline: nAgents < 1 throws', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  await assert.rejects(adapter.runDebate(scenario(), { nAgents: 0, nRounds: 1 }))
})

test('baseline: nRounds < 1 throws', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  await assert.rejects(adapter.runDebate(scenario(), { nAgents: 1, nRounds: 0 }))
})

test('baseline: reset() is a no-op (stateless)', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = new BaselineAnthropicAdapter({ apiKey: 'sk-test', client: fake.client })
  await adapter.reset()
  assert.equal(fake.calls.length, 0)
})
