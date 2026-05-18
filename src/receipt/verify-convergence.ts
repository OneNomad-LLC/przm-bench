/**
 * Verifier for convergence-benchmark receipts.
 *
 * Sibling to verify.ts (which handles the memory-benchmark ReceiptSchema).
 * Uses the same Ed25519 + JCS primitives — only the schema differs.
 *
 * Returns a discriminated union; never throws.
 */

import { createPublicKey, verify as cryptoVerify } from 'node:crypto'
import {
  ConvergenceReceiptSchema,
  type ConvergenceReceipt,
} from '../types-convergence.js'
import { canonicalizeReceiptForSigning, type JsonValue } from './canonicalize.js'
import { fingerprint } from './keys.js'
import type { VerifyResult } from './verify.js'

/**
 * Verify a signed convergence receipt against a PEM Ed25519 public key.
 *
 * Checks (in order):
 *  1. Receipt conforms to ConvergenceReceiptSchema.
 *  2. `signature` field is present.
 *  3. `signature.algorithm` is 'Ed25519'.
 *  4. `signature.publicKeyFingerprint` matches the supplied key.
 *  5. The Ed25519 signature over the canonicalized payload is valid.
 */
export function verifyConvergenceReceipt(
  receipt: ConvergenceReceipt,
  publicKeyPem: string,
): VerifyResult {
  const parsed = ConvergenceReceiptSchema.safeParse(receipt)
  if (!parsed.success) {
    return {
      ok: false,
      reason: `schema mismatch: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
    }
  }

  const r = parsed.data

  if (!r.signature) {
    return { ok: false, reason: 'missing signature' }
  }
  if (r.signature.algorithm !== 'Ed25519') {
    return { ok: false, reason: `unsupported algorithm: ${r.signature.algorithm}` }
  }

  let pubKeyFingerprint: string
  try {
    pubKeyFingerprint = fingerprint(publicKeyPem)
  } catch {
    return { ok: false, reason: 'invalid public key' }
  }

  if (pubKeyFingerprint !== r.signature.publicKeyFingerprint) {
    return { ok: false, reason: 'public key fingerprint mismatch' }
  }

  // Use the same exclusion-list canonicalization that the signer uses.
  // It internally strips signature + ranAt + receiptId so signatures
  // are stable across runs whose only differences are timestamps and
  // random UUIDs.
  const payload = canonicalizeReceiptForSigning(r as unknown as JsonValue)

  let sigBuffer: Buffer
  try {
    sigBuffer = Buffer.from(r.signature.value, 'base64url')
  } catch {
    return { ok: false, reason: 'invalid signature encoding' }
  }

  let pubKeyObj
  try {
    pubKeyObj = createPublicKey(publicKeyPem)
  } catch {
    return { ok: false, reason: 'invalid public key' }
  }

  let valid: boolean
  try {
    valid = cryptoVerify(null, payload, pubKeyObj, sigBuffer)
  } catch {
    return { ok: false, reason: 'invalid signature' }
  }

  if (!valid) {
    return { ok: false, reason: 'invalid signature' }
  }

  return { ok: true }
}
