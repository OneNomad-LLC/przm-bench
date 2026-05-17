/**
 * Receipt signing — Ed25519 via Node native crypto.
 *
 * The private key is NEVER read from disk by this module. The caller is
 * responsible for sourcing it (e.g. from process.env.RECEIPT_SIGNING_PRIVATE_KEY
 * in a GitHub Actions workflow) and passing it as a function argument.
 *
 * The private key and its derivatives are NEVER logged.
 */

import { createPrivateKey, createPublicKey, sign as cryptoSign } from 'node:crypto'
import { type Receipt } from '../types.js'
import { canonicalizeToBytes, type JsonValue } from './canonicalize.js'
import { fingerprint } from './keys.js'

/**
 * Sign a receipt with an Ed25519 private key.
 *
 * @param receipt - The fully-populated receipt minus the `signature` field.
 * @param privateKeyPem - PEM-encoded Ed25519 private key (PKCS#8 format as
 *   produced by `openssl genpkey -algorithm ed25519`). Caller sources this
 *   from an environment secret — never from a file in the repo.
 * @returns The receipt with `signature` populated.
 */
export function signReceipt(
  receipt: Omit<Receipt, 'signature'>,
  privateKeyPem: string,
): Receipt {
  // Parse the private key object
  const privKeyObj = createPrivateKey(privateKeyPem)

  // Derive the public key so we can compute the fingerprint without
  // requiring the caller to supply it separately.
  const pubKeyObj = createPublicKey(privKeyObj)

  // Compute the canonicalized payload — the bytes actually signed.
  // Cast is safe: Receipt fields are all JSON-serializable primitives/objects.
  const payload = canonicalizeToBytes(receipt as unknown as JsonValue)

  // Ed25519 sign — no digest algorithm argument; Ed25519 hashes internally.
  const sigBuffer = cryptoSign(null, payload, privKeyObj)

  // base64url encoding (no padding) per the receipt schema.
  const sigValue = sigBuffer.toString('base64url')

  // Fingerprint of the *public* key — safe to log/store.
  const pubFingerprint = fingerprint(pubKeyObj.export({ type: 'spki', format: 'pem' }) as string)

  const signed: Receipt = {
    ...receipt,
    signature: {
      algorithm: 'Ed25519',
      publicKeyFingerprint: pubFingerprint,
      value: sigValue,
    },
  }

  return signed
}
