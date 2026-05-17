/**
 * Ed25519 signer for convergence-benchmark receipts.
 *
 * Same primitive as src/receipt/sign.ts (Node native crypto, JCS
 * canonicalization), but takes the ConvergenceReceipt shape. Kept in a
 * sibling file so the memory-benchmark signer stays untouched and the
 * type surface for each benchmark is independent.
 *
 * The private key is NEVER read from disk by this module. The caller is
 * responsible for sourcing it (e.g. via Windows Credential Manager or
 * a GitHub Actions secret) and passing it as a PEM string.
 */

import { createPrivateKey, createPublicKey, sign as cryptoSign } from 'node:crypto'
import { canonicalizeToBytes, type JsonValue } from './canonicalize.js'
import { fingerprint } from './keys.js'
import type { ConvergenceReceipt } from '../types-convergence.js'

export function signConvergenceReceipt(
  receipt: Omit<ConvergenceReceipt, 'signature'>,
  privateKeyPem: string,
): ConvergenceReceipt {
  const privKeyObj = createPrivateKey(privateKeyPem)
  const pubKeyObj = createPublicKey(privKeyObj)

  // The receipt is cast to JsonValue — all ConvergenceReceipt fields are
  // primitives, arrays of primitives, or nested plain objects, so this
  // is safe under JCS canonicalization.
  const payload = canonicalizeToBytes(receipt as unknown as JsonValue)
  const sigBuffer = cryptoSign(null, payload, privKeyObj)
  const sigValue = sigBuffer.toString('base64url')

  const pubFingerprint = fingerprint(
    pubKeyObj.export({ type: 'spki', format: 'pem' }) as string,
  )

  return {
    ...receipt,
    signature: {
      algorithm: 'Ed25519',
      publicKeyFingerprint: pubFingerprint,
      value: sigValue,
    },
  }
}
