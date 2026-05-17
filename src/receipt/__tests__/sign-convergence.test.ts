import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateKeyPairSync,
  createPublicKey,
  verify as cryptoVerify,
} from 'node:crypto'
import { signConvergenceReceipt } from '../sign-convergence.js'
import { canonicalizeToBytes, type JsonValue } from '../canonicalize.js'
import { fingerprint } from '../keys.js'
import type { ConvergenceReceipt } from '../../types-convergence.js'

function sampleReceipt(): Omit<ConvergenceReceipt, 'signature'> {
  return {
    receiptId: '00000000-0000-0000-0000-000000000001',
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

test('signConvergenceReceipt: signature verifies against canonicalized payload', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const signed = signConvergenceReceipt(sampleReceipt(), privPem)

  assert.equal(signed.signature?.algorithm, 'Ed25519')
  assert.ok(signed.signature?.value)
  assert.ok(signed.signature?.publicKeyFingerprint)

  // Manually verify: rebuild the unsigned bytes, run cryptoVerify with pubkey
  const { signature: _sig, ...unsigned } = signed
  const payload = canonicalizeToBytes(unsigned as unknown as JsonValue)
  const sigBuf = Buffer.from(signed.signature!.value, 'base64url')
  const ok = cryptoVerify(null, payload, publicKey, sigBuf)
  assert.equal(ok, true)
})

test('signConvergenceReceipt: fingerprint matches the public key', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const signed = signConvergenceReceipt(sampleReceipt(), privPem)

  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string
  assert.equal(signed.signature?.publicKeyFingerprint, fingerprint(pubPem))
})

test('signConvergenceReceipt: tampering the scores invalidates the signature', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const signed = signConvergenceReceipt(sampleReceipt(), privPem)

  // Mutate a score field after signing
  const tampered: ConvergenceReceipt = {
    ...signed,
    scores: { ...signed.scores, correct_final_answer_rate: 0.5 },
  }
  const { signature: _sig, ...unsigned } = tampered
  const payload = canonicalizeToBytes(unsigned as unknown as JsonValue)
  const sigBuf = Buffer.from(tampered.signature!.value, 'base64url')
  const ok = cryptoVerify(null, payload, publicKey, sigBuf)
  assert.equal(ok, false)
})

test('signConvergenceReceipt: tampering a transcript message invalidates the signature', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const signed = signConvergenceReceipt(sampleReceipt(), privPem)

  const tampered: ConvergenceReceipt = JSON.parse(JSON.stringify(signed))
  tampered.perScenario[0]!.transcript.rounds[0]!.perAgent[0]!.message = 'tampered'
  const { signature: _sig, ...unsigned } = tampered
  const payload = canonicalizeToBytes(unsigned as unknown as JsonValue)
  const sigBuf = Buffer.from(tampered.signature!.value, 'base64url')
  const ok = cryptoVerify(null, payload, publicKey, sigBuf)
  assert.equal(ok, false)
})
