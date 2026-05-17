/**
 * Tests for Ed25519 receipt signing and verification.
 *
 * Uses Node's built-in node:test runner.
 * Keys are generated in-process — no process.env access, no disk I/O for keys.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { canonicalize, canonicalizeToBytes } from '../canonicalize.js'
import { fingerprint } from '../keys.js'
import { signReceipt } from '../sign.js'
import { verifyReceipt } from '../verify.js'
import type { Receipt } from '../../types.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateEd25519Pair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  return {
    privateKeyPem: privateKey as string,
    publicKeyPem: publicKey as string,
  }
}

/** Minimal valid unsigned receipt for test use. */
function makeUnsignedReceipt(): Omit<Receipt, 'signature'> {
  return {
    receiptId: '00000000-0000-4000-8000-000000000001',
    benchVersion: '0.0.1',
    ranAt: '2026-05-17T12:00:00.000Z',
    adapter: { name: 'engram', version: '2.4.0' },
    fixture: {
      id: 'test-fixture-001',
      sha256: 'a'.repeat(64),
      n: 10,
    },
    environment: {
      node: '22.0.0',
      platform: 'linux/amd64',
      git: { commit: 'abc1234', dirty: false },
    },
    scores: {
      recall_at_5: 0.9,
      recall_at_10: 0.95,
      ndcg_at_10: 0.88,
      latency_p50_ms: 42,
      latency_p95_ms: 150,
      ingest_throughput_items_per_sec: 300,
    },
    perQuery: [
      { queryId: 'q-001', retrieved: ['id-1', 'id-2'], hit: true, rank: 1, latencyMs: 40 },
    ],
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sign + verify roundtrip', () => {
  it('signs a receipt and verifies it successfully', () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519Pair()
    const unsigned = makeUnsignedReceipt()
    const signed = signReceipt(unsigned, privateKeyPem)

    assert.ok(signed.signature, 'signature field is present')
    assert.equal(signed.signature.algorithm, 'Ed25519')
    assert.match(signed.signature.publicKeyFingerprint, /^sha256:[a-f0-9]{64}$/)
    assert.ok(signed.signature.value.length > 0, 'signature value is non-empty')

    const result = verifyReceipt(signed, publicKeyPem)
    assert.deepEqual(result, { ok: true })
  })
})

describe('tampered receipt rejection', () => {
  it('rejects when a top-level score is modified', () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519Pair()
    const signed = signReceipt(makeUnsignedReceipt(), privateKeyPem)

    const tampered: Receipt = {
      ...signed,
      scores: { ...signed.scores, recall_at_5: 0.999 },
    }

    const result = verifyReceipt(tampered, publicKeyPem)
    assert.equal(result.ok, false)
    assert.ok('reason' in result && result.reason)
  })

  it('rejects when a perQuery rank is modified', () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519Pair()
    const signed = signReceipt(makeUnsignedReceipt(), privateKeyPem)

    const tamperedPerQuery = signed.perQuery.map((pq, i) =>
      i === 0 ? { ...pq, rank: 99 } : pq,
    )
    const tampered: Receipt = { ...signed, perQuery: tamperedPerQuery }

    const result = verifyReceipt(tampered, publicKeyPem)
    assert.equal(result.ok, false)
    assert.ok('reason' in result && result.reason)
  })

  it('rejects when retrieved IDs are reordered', () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519Pair()
    const unsigned: Omit<Receipt, 'signature'> = {
      ...makeUnsignedReceipt(),
      perQuery: [
        { queryId: 'q-001', retrieved: ['id-1', 'id-2', 'id-3'], hit: true, rank: 1, latencyMs: 40 },
      ],
    }
    const signed = signReceipt(unsigned, privateKeyPem)

    const tampered: Receipt = {
      ...signed,
      perQuery: [
        { ...signed.perQuery[0]!, retrieved: ['id-3', 'id-2', 'id-1'] },
      ],
    }

    const result = verifyReceipt(tampered, publicKeyPem)
    assert.equal(result.ok, false)
  })
})

describe('missing signature', () => {
  it('rejects an unsigned receipt with a clear reason', () => {
    const { publicKeyPem } = generateEd25519Pair()
    // Receipt with signature explicitly undefined
    const unsigned = makeUnsignedReceipt() as Receipt

    const result = verifyReceipt(unsigned, publicKeyPem)
    assert.equal(result.ok, false)
    assert.ok('reason' in result)
    assert.match(result.reason as string, /missing signature/)
  })
})

describe('wrong public key', () => {
  it('rejects when a different public key is supplied for verification', () => {
    const { privateKeyPem } = generateEd25519Pair()
    const { publicKeyPem: wrongPublicKeyPem } = generateEd25519Pair()

    const signed = signReceipt(makeUnsignedReceipt(), privateKeyPem)
    const result = verifyReceipt(signed, wrongPublicKeyPem)

    assert.equal(result.ok, false)
    assert.ok('reason' in result && result.reason)
  })
})

describe('canonicalization determinism', () => {
  it('produces identical bytes for the same input across 100 calls', () => {
    const value = makeUnsignedReceipt()
    const first = canonicalize(value as unknown as Parameters<typeof canonicalize>[0])
    for (let i = 0; i < 99; i++) {
      const next = canonicalize(value as unknown as Parameters<typeof canonicalize>[0])
      assert.equal(next, first, `iteration ${i + 1} produced different output`)
    }
  })

  it('produces identical Buffers for the same input across 100 calls', () => {
    const value = makeUnsignedReceipt()
    const first = canonicalizeToBytes(value as unknown as Parameters<typeof canonicalizeToBytes>[0])
    for (let i = 0; i < 99; i++) {
      const next = canonicalizeToBytes(value as unknown as Parameters<typeof canonicalizeToBytes>[0])
      assert.deepEqual(next, first, `iteration ${i + 1} produced different bytes`)
    }
  })

  it('sorts object keys regardless of insertion order', () => {
    const a = canonicalize({ z: 1, a: 2, m: 3 } as unknown as Parameters<typeof canonicalize>[0])
    const b = canonicalize({ m: 3, z: 1, a: 2 } as unknown as Parameters<typeof canonicalize>[0])
    assert.equal(a, b)
    assert.equal(a, '{"a":2,"m":3,"z":1}')
  })
})

describe('key fingerprint', () => {
  it('returns the same fingerprint for the same public key', () => {
    const { publicKeyPem } = generateEd25519Pair()
    const fp1 = fingerprint(publicKeyPem)
    const fp2 = fingerprint(publicKeyPem)
    assert.equal(fp1, fp2)
    assert.match(fp1, /^sha256:[a-f0-9]{64}$/)
  })

  it('returns different fingerprints for different keys', () => {
    const { publicKeyPem: pub1 } = generateEd25519Pair()
    const { publicKeyPem: pub2 } = generateEd25519Pair()
    assert.notEqual(fingerprint(pub1), fingerprint(pub2))
  })
})

describe('private key never appears in error messages', () => {
  it('does not leak the private key PEM in any thrown or returned error', () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519Pair()
    const signed = signReceipt(makeUnsignedReceipt(), privateKeyPem)

    // Tamper then verify — the private key PEM must not appear in the reason string
    const tampered: Receipt = { ...signed, scores: { ...signed.scores, recall_at_5: 1 } }
    const result = verifyReceipt(tampered, publicKeyPem)

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(
        !result.reason.includes(privateKeyPem.slice(0, 20)),
        'private key prefix must not appear in reason',
      )
    }
  })

  it('does not surface the private key when given a malformed public key', () => {
    const { privateKeyPem } = generateEd25519Pair()
    const signed = signReceipt(makeUnsignedReceipt(), privateKeyPem)

    // Pass obviously bad public key — should not expose the private key
    const result = verifyReceipt(signed, 'not-a-pem')
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(
        !result.reason.includes(privateKeyPem.slice(0, 20)),
        'private key prefix must not appear in reason',
      )
    }
  })
})
