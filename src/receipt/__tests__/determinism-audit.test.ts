/**
 * Determinism audit tests — required coverage for the audit-fix commit.
 *
 * Verifies:
 * 1. Two convergence receipts with identical scores/transcripts but different
 *    ranAt + receiptId produce byte-identical signatures.
 * 2. Same guarantee for memory receipts.
 * 3. Tampering ranAt or receiptId after signing does NOT invalidate the
 *    signature (intentional — those fields are outside the signed payload).
 * 4. Tampering any other field still invalidates the signature.
 *
 * Run with:
 *   node --import tsx --test src/receipt/__tests__/determinism-audit.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { signConvergenceReceipt } from '../sign-convergence.js'
import { verifyConvergenceReceipt } from '../verify-convergence.js'
import { signReceipt } from '../sign.js'
import { verifyReceipt } from '../verify.js'
import type { ConvergenceReceipt } from '../../types-convergence.js'
import type { Receipt } from '../../types.js'

// ── Key helpers ─────────────────────────────────────────────────────

function genKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    pubPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  }
}

// ── Fixture builders ────────────────────────────────────────────────

function baseConvergenceReceipt(): Omit<ConvergenceReceipt, 'signature'> {
  return {
    receiptId: '11111111-1111-4111-8111-111111111111',
    benchmark: 'convergence-v0.1-preview',
    benchVersion: '0.1.0-preview',
    ranAt: '2026-01-01T00:00:00.000Z',
    adapter: {
      name: 'baseline-anthropic',
      version: '0.1.0',
      llmModel: 'claude-haiku-4-5',
    },
    configuration: { nAgents: 2, nRounds: 2 },
    fixtureSet: {
      n: 1,
      setSha256: 'c'.repeat(64),
    },
    environment: {
      node: 'v22.0.0',
      platform: 'linux-x64',
      git: { commit: 'deadbeef', dirty: false },
    },
    scores: {
      correct_final_answer_rate: 0.75,
      collapse_rate: 0.5,
      sycophancy_ratio: 0.0,
      tokens_per_correct_answer: 512,
      position_flips_per_agent_per_round: 0.25,
    },
    perScenario: [
      {
        scenarioId: 'det-001',
        scenarioSha256: 'd'.repeat(64),
        finalConsensus: 'Paris',
        correct: true,
        collapsed: false,
        sycophancyOccurred: null,
        positionFlipsByAgent: [0, 1],
        totalOutputTokens: 256,
        transcript: {
          scenarioId: 'det-001',
          rounds: [
            {
              roundNumber: 0,
              perAgent: [
                { agentIndex: 0, answer: 'London', message: 'I think London', outputTokens: 50 },
                { agentIndex: 1, answer: 'Paris', message: 'Clearly Paris', outputTokens: 60 },
              ],
            },
            {
              roundNumber: 1,
              perAgent: [
                { agentIndex: 0, answer: 'Paris', message: 'Reconsidering — Paris', outputTokens: 70 },
                { agentIndex: 1, answer: 'Paris', message: 'Holding Paris', outputTokens: 76 },
              ],
            },
          ],
        },
      },
    ],
  }
}

function baseMemoryReceipt(): Omit<Receipt, 'signature'> {
  return {
    receiptId: '22222222-2222-4222-8222-222222222222',
    benchVersion: '0.0.1',
    ranAt: '2026-01-01T00:00:00.000Z',
    adapter: { name: 'engram', version: '2.4.0' },
    fixture: {
      id: 'det-fixture-001',
      sha256: 'e'.repeat(64),
      n: 5,
    },
    environment: {
      node: '22.0.0',
      platform: 'linux/amd64',
      git: { commit: 'cafebabe', dirty: false },
    },
    scores: {
      recall_at_5: 0.8,
      recall_at_10: 0.9,
      ndcg_at_10: 0.85,
      latency_p50_ms: 42,
      latency_p95_ms: 200,
      ingest_throughput_items_per_sec: 250,
    },
    perQuery: [
      { queryId: 'q-001', retrieved: ['id-1'], hit: true, rank: 1, latencyMs: 38 },
    ],
  }
}

// ── Test 1: convergence receipt determinism ──────────────────────────

test('convergence receipt: identical scores+transcripts but different ranAt+receiptId → byte-identical signature', () => {
  const { privPem } = genKeyPair()

  const receiptA = baseConvergenceReceipt()
  const receiptB: Omit<ConvergenceReceipt, 'signature'> = {
    ...baseConvergenceReceipt(),
    ranAt: '2099-12-31T23:59:59.999Z',
    receiptId: '99999999-9999-4999-8999-999999999999',
  }

  const signedA = signConvergenceReceipt(receiptA, privPem)
  const signedB = signConvergenceReceipt(receiptB, privPem)

  assert.equal(
    signedA.signature!.value,
    signedB.signature!.value,
    'Signatures must be byte-identical when only ranAt/receiptId differ',
  )
})

// ── Test 2: memory receipt determinism ──────────────────────────────

test('memory receipt: identical scores but different ranAt+receiptId → byte-identical signature', () => {
  const { privPem } = genKeyPair()

  const receiptA = baseMemoryReceipt()
  const receiptB: Omit<Receipt, 'signature'> = {
    ...baseMemoryReceipt(),
    ranAt: '2099-12-31T23:59:59.999Z',
    receiptId: '88888888-8888-4888-8888-888888888888',
  }

  const signedA = signReceipt(receiptA, privPem)
  const signedB = signReceipt(receiptB, privPem)

  assert.equal(
    signedA.signature!.value,
    signedB.signature!.value,
    'Signatures must be byte-identical when only ranAt/receiptId differ',
  )
})

// ── Test 3: memory receipt latency field determinism ─────────────────

test('memory receipt: wall-clock latency/throughput changes in scores do NOT invalidate signature', () => {
  const { privPem, pubPem } = genKeyPair()

  const signed = signReceipt(baseMemoryReceipt(), privPem)

  // Simulate a different-hardware re-run: latency changes but correctness scores
  // are identical. The receipt consumer may post-update these fields; the
  // signed payload intentionally excludes them.
  const reMeasured: Receipt = {
    ...signed,
    scores: {
      ...signed.scores,
      latency_p50_ms: 9999,
      latency_p95_ms: 99999,
      ingest_throughput_items_per_sec: 1,
    },
  }

  const result = verifyReceipt(reMeasured, pubPem)
  assert.equal(
    result.ok,
    true,
    'Changing latency_p50_ms / latency_p95_ms / ingest_throughput_items_per_sec must not invalidate the signature',
  )
})

// ── Test 4: tampering ranAt does NOT invalidate convergence signature ─

test('convergence receipt: tampering ranAt after signing does NOT invalidate signature (intentional)', () => {
  const { privPem, pubPem } = genKeyPair()
  const signed = signConvergenceReceipt(baseConvergenceReceipt(), privPem)

  const postTamperedRanAt: ConvergenceReceipt = {
    ...signed,
    ranAt: '2050-06-15T12:00:00.000Z',
  }

  const result = verifyConvergenceReceipt(postTamperedRanAt, pubPem)
  assert.equal(
    result.ok,
    true,
    'ranAt is outside the signed payload by design — changing it must not break the signature',
  )
})

test('convergence receipt: tampering receiptId after signing does NOT invalidate signature (intentional)', () => {
  const { privPem, pubPem } = genKeyPair()
  const signed = signConvergenceReceipt(baseConvergenceReceipt(), privPem)

  const postTamperedId: ConvergenceReceipt = {
    ...signed,
    receiptId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  }

  const result = verifyConvergenceReceipt(postTamperedId, pubPem)
  assert.equal(
    result.ok,
    true,
    'receiptId is outside the signed payload by design — changing it must not break the signature',
  )
})

test('memory receipt: tampering ranAt after signing does NOT invalidate signature (intentional)', () => {
  const { privPem, pubPem } = genKeyPair()
  const signed = signReceipt(baseMemoryReceipt(), privPem)

  const postTamperedRanAt: Receipt = {
    ...signed,
    ranAt: '2050-06-15T12:00:00.000Z',
  }

  const result = verifyReceipt(postTamperedRanAt, pubPem)
  assert.equal(result.ok, true, 'ranAt is outside the signed payload — must not break verification')
})

test('memory receipt: tampering receiptId after signing does NOT invalidate signature (intentional)', () => {
  const { privPem, pubPem } = genKeyPair()
  const signed = signReceipt(baseMemoryReceipt(), privPem)

  const postTamperedId: Receipt = {
    ...signed,
    receiptId: 'ffffffff-ffff-4fff-afff-ffffffffffff',
  }

  const result = verifyReceipt(postTamperedId, pubPem)
  assert.equal(result.ok, true, 'receiptId is outside the signed payload — must not break verification')
})

// ── Test 5: covered fields still invalidate ──────────────────────────

test('convergence receipt: tampering a SCORE (covered) still invalidates the signature', () => {
  const { privPem, pubPem } = genKeyPair()
  const signed = signConvergenceReceipt(baseConvergenceReceipt(), privPem)

  const tampered: ConvergenceReceipt = {
    ...signed,
    scores: { ...signed.scores, correct_final_answer_rate: 0.9999 },
  }

  const result = verifyConvergenceReceipt(tampered, pubPem)
  assert.equal(result.ok, false, 'Score tampering must invalidate the signature')
})

test('convergence receipt: tampering a TRANSCRIPT message (covered) still invalidates the signature', () => {
  const { privPem, pubPem } = genKeyPair()
  const signed = signConvergenceReceipt(baseConvergenceReceipt(), privPem)

  const tampered: ConvergenceReceipt = JSON.parse(JSON.stringify(signed))
  tampered.perScenario[0]!.transcript.rounds[0]!.perAgent[0]!.message = 'I think Paris all along'

  const result = verifyConvergenceReceipt(tampered, pubPem)
  assert.equal(result.ok, false, 'Transcript tampering must invalidate the signature')
})

test('memory receipt: tampering a SCORE (covered field recall_at_10) still invalidates the signature', () => {
  const { privPem, pubPem } = genKeyPair()
  const signed = signReceipt(baseMemoryReceipt(), privPem)

  const tampered: Receipt = {
    ...signed,
    scores: { ...signed.scores, recall_at_10: 0.9999 },
  }

  const result = verifyReceipt(tampered, pubPem)
  assert.equal(result.ok, false, 'Score tampering (recall_at_10) must invalidate the signature')
})

test('memory receipt: tampering perQuery rank (covered) still invalidates the signature', () => {
  const { privPem, pubPem } = genKeyPair()
  const signed = signReceipt(baseMemoryReceipt(), privPem)

  const tampered: Receipt = {
    ...signed,
    perQuery: signed.perQuery.map((pq) => ({ ...pq, rank: 99 })),
  }

  const result = verifyReceipt(tampered, pubPem)
  assert.equal(result.ok, false, 'perQuery tampering must invalidate the signature')
})
