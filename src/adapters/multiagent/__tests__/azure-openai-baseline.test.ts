/**
 * Tests for the AzureOpenAIBaselineAdapter.
 *
 * No live API calls. We inject a hand-crafted fake AzureOpenAI client
 * via the constructor's `client` option and verify the adapter's
 * orchestration logic round-by-round. Same contract as the Anthropic
 * baseline tests.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AzureOpenAIBaselineAdapter } from '../azure-openai-baseline.js'
import type { ConvergenceScenario } from '../../../types-convergence.js'

// ── Fake AzureOpenAI client ────────────────────────────────────────

interface CapturedCall {
  model: string
  messages: Array<{ role: string; content: string | null }>
  tools: unknown
  toolChoice: unknown
  maxCompletionTokens: number
}

interface FakeChoice {
  message: {
    role: 'assistant'
    content: string | null
    tool_calls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
  }
}

interface FakeChatCompletion {
  choices: FakeChoice[]
  usage?: { completion_tokens: number; prompt_tokens: number; total_tokens: number }
}

function makeFakeClient(responder: (call: CapturedCall) => FakeChatCompletion) {
  const calls: CapturedCall[] = []
  return {
    calls,
    client: {
      chat: {
        completions: {
          create: async (args: any): Promise<any> => {
            calls.push({
              model: args.model,
              messages: args.messages,
              tools: args.tools,
              toolChoice: args.tool_choice,
              maxCompletionTokens: args.max_completion_tokens,
            })
            return responder({
              model: args.model,
              messages: args.messages,
              tools: args.tools,
              toolChoice: args.tool_choice,
              maxCompletionTokens: args.max_completion_tokens,
            })
          },
        },
      },
    } as any,
  }
}

function answerResponse(answer: string, reasoning: string, tokens = 100): FakeChatCompletion {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'tc_test',
              type: 'function',
              function: {
                name: 'submit_answer',
                arguments: JSON.stringify({ answer, reasoning }),
              },
            },
          ],
        },
      },
    ],
    usage: { completion_tokens: tokens, prompt_tokens: 50, total_tokens: tokens + 50 },
  }
}

function scenario(overrides: Partial<ConvergenceScenario> = {}): ConvergenceScenario {
  return {
    id: 'test-001',
    category: 'factual-math',
    question: 'What is 2 + 2?',
    correctAnswer: '4',
    distractors: ['3', '5'],
    ...overrides,
  }
}

function makeAdapter(client: any) {
  return new AzureOpenAIBaselineAdapter({
    endpoint: 'https://test.openai.azure.com/',
    apiKey: 'test-key',
    deploymentName: 'gpt-5-mini',
    llmModel: 'gpt-5-mini',
    client,
  })
}

// ── Basic orchestration ────────────────────────────────────────────

test('azure-baseline: drives nAgents × nRounds calls in order', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'easy'))
  const adapter = makeAdapter(fake.client)
  const transcript = await adapter.runDebate(scenario(), { nAgents: 3, nRounds: 2 })

  assert.equal(fake.calls.length, 6)
  assert.equal(transcript.rounds.length, 2)
  assert.equal(transcript.rounds[0]!.perAgent.length, 3)
})

test('azure-baseline: uses the DEPLOYMENT name as model param, not the underlying model', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = new AzureOpenAIBaselineAdapter({
    endpoint: 'https://test.openai.azure.com/',
    apiKey: 'test',
    deploymentName: 'my-custom-deployment-name',
    llmModel: 'gpt-5-mini', // underlying model, reported on receipts
    client: fake.client,
  })
  await adapter.runDebate(scenario(), { nAgents: 1, nRounds: 1 })
  assert.equal(fake.calls[0]!.model, 'my-custom-deployment-name')
  // But .llmModel still reports the underlying model
  assert.equal(adapter.llmModel, 'gpt-5-mini')
})

test('azure-baseline: tool_use is forced via tool_choice', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = makeAdapter(fake.client)
  await adapter.runDebate(scenario(), { nAgents: 1, nRounds: 1 })
  assert.deepEqual(fake.calls[0]!.toolChoice, {
    type: 'function',
    function: { name: 'submit_answer' },
  })
})

test('azure-baseline: synchronous round semantics — round-N agents see only round N-1', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = makeAdapter(fake.client)
  await adapter.runDebate(scenario(), { nAgents: 3, nRounds: 1 })
  const agent2Content = fake.calls[2]!.messages.find((m) => m.role === 'user')!.content!
  assert.ok(!agent2Content.includes('Agent 0'))
  assert.ok(!agent2Content.includes('Agent 1'))
})

// ── Confederate injection ──────────────────────────────────────────

test('azure-baseline: confederate prompt is added to designated agent in round 0 ONLY', async () => {
  const fake = makeFakeClient(() => answerResponse('X', 'r'))
  const adapter = makeAdapter(fake.client)
  const s = scenario({
    confederateConfig: {
      agentIndex: 1,
      assignedAnswer: 'X',
      rationale: 'I checked it twice and X is right.',
    },
  })
  await adapter.runDebate(s, { nAgents: 3, nRounds: 2 })

  const sysOf = (i: number) =>
    fake.calls[i]!.messages.find((m) => m.role === 'system')!.content!

  // Round 0 agent 1 gets confederate prompt.
  assert.ok(sysOf(1).includes('I checked it twice and X is right.'))
  assert.ok(sysOf(1).includes('"X"'))
  // Round 0 agent 0 and agent 2 do NOT.
  assert.ok(!sysOf(0).includes('I checked it twice'))
  assert.ok(!sysOf(2).includes('I checked it twice'))
  // Round 1 agent 1 does NOT (confederate role does not persist).
  assert.ok(!sysOf(4).includes('I checked it twice'))
})

test('azure-baseline: confederate agentIndex out-of-range throws', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = makeAdapter(fake.client)
  const s = scenario({
    confederateConfig: { agentIndex: 5, assignedAnswer: 'X', rationale: 'r' },
  })
  await assert.rejects(
    adapter.runDebate(s, { nAgents: 3, nRounds: 1 }),
    /confederate agentIndex 5 >= nAgents 3/,
  )
})

// ── Answer extraction + normalization ──────────────────────────────

test('azure-baseline: extracts answer from tool_call.function.arguments JSON', async () => {
  const fake = makeFakeClient(() => answerResponse('  391  ', 'r'))
  const adapter = makeAdapter(fake.client)
  const t = await adapter.runDebate(scenario(), { nAgents: 1, nRounds: 1 })
  assert.equal(t.rounds[0]!.perAgent[0]!.answer, '391')
})

test('azure-baseline: normalizes "True" / "FALSE" to lowercase', async () => {
  const fake = makeFakeClient(() => answerResponse('True', 'r'))
  const adapter = makeAdapter(fake.client)
  const t = await adapter.runDebate(scenario({ correctAnswer: 'true' }), {
    nAgents: 1,
    nRounds: 1,
  })
  assert.equal(t.rounds[0]!.perAgent[0]!.answer, 'true')
})

test('azure-baseline: throws when no tool_call returned', async () => {
  const fake = makeFakeClient(
    () =>
      ({
        choices: [{ message: { role: 'assistant', content: 'I refuse', tool_calls: [] } }],
        usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 },
      }) as any,
  )
  const adapter = makeAdapter(fake.client)
  await assert.rejects(
    adapter.runDebate(scenario(), { nAgents: 1, nRounds: 1 }),
    /returned no function tool_call/,
  )
})

test('azure-baseline: throws when tool args are not valid JSON', async () => {
  const fake = makeFakeClient(
    () =>
      ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'x',
                  type: 'function',
                  function: { name: 'submit_answer', arguments: '{not valid json' },
                },
              ],
            },
          },
        ],
        usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 },
      }) as any,
  )
  const adapter = makeAdapter(fake.client)
  await assert.rejects(
    adapter.runDebate(scenario(), { nAgents: 1, nRounds: 1 }),
    /not valid JSON/,
  )
})

test('azure-baseline: throws when tool args are malformed (wrong types)', async () => {
  const fake = makeFakeClient(() => ({
    choices: [
      {
        message: {
          role: 'assistant' as const,
          content: null,
          tool_calls: [
            {
              id: 'x',
              type: 'function' as const,
              function: {
                name: 'submit_answer',
                arguments: JSON.stringify({ answer: 42, reasoning: 'r' }),
              },
            },
          ],
        },
      },
    ],
    usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 },
  }))
  const adapter = makeAdapter(fake.client)
  await assert.rejects(
    adapter.runDebate(scenario(), { nAgents: 1, nRounds: 1 }),
    /malformed tool args/,
  )
})

// ── Token capture ──────────────────────────────────────────────────

test('azure-baseline: captures completion_tokens per turn', async () => {
  let tokens = 100
  const fake = makeFakeClient(() => answerResponse('4', 'r', tokens++))
  const adapter = makeAdapter(fake.client)
  const t = await adapter.runDebate(scenario(), { nAgents: 2, nRounds: 2 })
  assert.deepEqual(
    t.rounds.flatMap((r) => r.perAgent.map((p) => p.outputTokens)),
    [100, 101, 102, 103],
  )
})

// ── Input validation ───────────────────────────────────────────────

test('azure-baseline: nAgents < 1 throws', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = makeAdapter(fake.client)
  await assert.rejects(adapter.runDebate(scenario(), { nAgents: 0, nRounds: 1 }))
})

test('azure-baseline: nRounds < 1 throws', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = makeAdapter(fake.client)
  await assert.rejects(adapter.runDebate(scenario(), { nAgents: 1, nRounds: 0 }))
})

test('azure-baseline: reset() is a no-op (stateless)', async () => {
  const fake = makeFakeClient(() => answerResponse('4', 'r'))
  const adapter = makeAdapter(fake.client)
  await adapter.reset()
  assert.equal(fake.calls.length, 0)
})
