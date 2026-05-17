import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { signConvergenceReceipt } from '../sign-convergence.js'
import { verifyConvergenceReceipt } from '../verify-convergence.js'
import type { ConvergenceReceipt } from '../../types-convergence.js'

function sampleReceipt(): Omit<ConvergenceReceipt, 'signature'> {
  return {
    receiptId: '00000000-0000-0000-0000-000000000002',
    benchmark: 'convergence-v0.1-preview',
    benchVersion: '0.1.0-preview',
    ranAt: '2026-05-17T16:00:00.000Z',
    adapter: {
      name: 'baseline-anthropic',
      version: '0.1.0',
      llmModel: 'claude-haiku-4-5',
    },
    configuration: { nAgents: 3, nRounds: 3 },
    fixtureSet: {
      n: 1,
      setSha256: 'a'.repeat(64),
    },
    environment: {
      node: 'v22.0.0',
      platform: 'linux-x64',
      git: { commit: 'abcdef0', dirty: false },
    },
    scores: {
      correct_final_answer_rate: 1,
      collapse_rate: 1,
      sycophancy_ratio: 0,
      tokens_per_correct_answer: 100,
      position_flips_per_agent_per_round: 0,
    },
    perScenario: [
      {
        scenarioId: 'x-001',
        scenarioSha256: 'b'.repeat(64),
        finalConsensus: 'OK',
        correct: true,
        collapsed: true,
        sycophancyOccurred: null,
        positionFlipsByAgent: [0, 0, 0],
        totalOutputTokens: 100,
        transcript: {
          scenarioId: 'x-001',
          rounds: [
            {
              roundNumber: 0,
              perAgent: [
                {
                  agentIndex: 0,
                  answer: 'OK',
                  message: 'ok',
                  outputTokens: 30,
                },
              ],
            },
          ],
        },
      },
    ],
  }
}

function genKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    pubPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  }
}

test('verifyConvergenceReceipt: returns ok on a freshly signed receipt', () => {
  const { privPem, pubPem } = genKeys()
  const signed = signConvergenceReceipt(sampleReceipt(), privPem)
  const result = verifyConvergenceReceipt(signed, pubPem)
  assert.deepEqual(result, { ok: true })
})

test('verifyConvergenceReceipt: rejects with mismatched public key', () => {
  const { privPem } = genKeys()
  const { pubPem: otherPub } = genKeys()
  const signed = signConvergenceReceipt(sampleReceipt(), privPem)
  const result = verifyConvergenceReceipt(signed, otherPub)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.match(result.reason, /fingerprint mismatch/)
  }
})

test('verifyConvergenceReceipt: rejects tampered scores', () => {
  const { privPem, pubPem } = genKeys()
  const signed = signConvergenceReceipt(sampleReceipt(), privPem)
  const tampered: ConvergenceReceipt = {
    ...signed,
    scores: { ...signed.scores, correct_final_answer_rate: 0.5 },
  }
  const result = verifyConvergenceReceipt(tampered, pubPem)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.match(result.reason, /invalid signature/)
  }
})

test('verifyConvergenceReceipt: rejects tampered transcript message', () => {
  const { privPem, pubPem } = genKeys()
  const signed = signConvergenceReceipt(sampleReceipt(), privPem)
  const tampered: ConvergenceReceipt = JSON.parse(JSON.stringify(signed))
  tampered.perScenario[0]!.transcript.rounds[0]!.perAgent[0]!.message = 'tampered'
  const result = verifyConvergenceReceipt(tampered, pubPem)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.match(result.reason, /invalid signature/)
  }
})

test('verifyConvergenceReceipt: rejects when signature missing', () => {
  const { pubPem } = genKeys()
  const unsigned = sampleReceipt() as ConvergenceReceipt
  const result = verifyConvergenceReceipt(unsigned, pubPem)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.match(result.reason, /missing signature/)
  }
})
