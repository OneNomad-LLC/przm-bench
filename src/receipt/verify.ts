/**
 * Receipt verification — Ed25519 via Node native crypto.
 *
 * Pure function: never throws, always returns a discriminated union.
 * Strict: rejects unsigned receipts, schema mismatches, and fingerprint mismatches.
 */

import { createPublicKey, verify as cryptoVerify } from 'node:crypto'
import { ReceiptSchema, type Receipt } from '../types.js'
import { canonicalizeToBytes, type JsonValue } from './canonicalize.js'
import { fingerprint } from './keys.js'

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * Verify a signed receipt against a PEM-encoded Ed25519 public key.
 *
 * Checks (in order):
 *  1. The receipt conforms to ReceiptSchema.
 *  2. A `signature` field is present.
 *  3. The `signature.algorithm` is 'Ed25519'.
 *  4. The `signature.publicKeyFingerprint` matches the supplied public key.
 *  5. The Ed25519 signature over the canonicalized payload (receipt minus
 *     the signature field) is valid.
 *
 * @param receipt - The receipt object to verify.
 * @param publicKeyPem - PEM-encoded Ed25519 public key (SPKI format).
 * @returns `{ok: true}` on success, `{ok: false, reason: string}` on failure.
 */
export function verifyReceipt(receipt: Receipt, publicKeyPem: string): VerifyResult {
  // 1. Schema validation
  const parsed = ReceiptSchema.safeParse(receipt)
  if (!parsed.success) {
    return { ok: false, reason: `schema mismatch: ${parsed.error.issues[0]?.message ?? 'unknown'}` }
  }

  const r = parsed.data

  // 2. Signature presence
  if (!r.signature) {
    return { ok: false, reason: 'missing signature' }
  }

  // 3. Algorithm check
  if (r.signature.algorithm !== 'Ed25519') {
    return { ok: false, reason: `unsupported algorithm: ${r.signature.algorithm}` }
  }

  // 4. Fingerprint check — verify the public key supplied matches the one
  //    that was used to sign.
  let pubKeyFingerprint: string
  try {
    pubKeyFingerprint = fingerprint(publicKeyPem)
  } catch {
    return { ok: false, reason: 'invalid public key' }
  }

  if (pubKeyFingerprint !== r.signature.publicKeyFingerprint) {
    return { ok: false, reason: 'public key fingerprint mismatch' }
  }

  // 5. Signature verification.
  //    Reconstruct the payload: the receipt without the `signature` field,
  //    then canonicalize it — identical to what sign.ts does.
  const { signature: _sig, ...receiptWithoutSig } = r
  const payload = canonicalizeToBytes(receiptWithoutSig as unknown as JsonValue)

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
