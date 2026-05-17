/**
 * Public-key utilities for receipt verification.
 *
 * Private keys NEVER live in source. To generate a keypair, run:
 *
 *   openssl genpkey -algorithm ed25519 -out receipt-signing.key
 *   openssl pkey -in receipt-signing.key -pubout -out receipt-signing.pub
 *
 * locally and commit ONLY receipt-signing.pub to keys/receipt-signing.pub.
 * The private key file must never be committed, staged, or placed anywhere
 * inside this repository.
 */

import { createHash, createPublicKey } from 'node:crypto'
import { readFile } from 'node:fs/promises'

/**
 * Read a PEM-encoded public key from disk.
 * Returns the raw PEM string (including header/footer lines).
 */
export async function loadPublicKey(path: string): Promise<string> {
  const content = await readFile(path, 'utf8')
  return content.trim()
}

/**
 * Compute the fingerprint of a PEM-encoded public key.
 * Format: `sha256:<lowercase-hex>` of the DER-encoded SubjectPublicKeyInfo.
 *
 * This matches the `signature.publicKeyFingerprint` field in a Receipt.
 */
export function fingerprint(publicKeyPem: string): string {
  const keyObj = createPublicKey(publicKeyPem)
  const der = keyObj.export({ type: 'spki', format: 'der' })
  const hex = createHash('sha256').update(der).digest('hex')
  return `sha256:${hex}`
}
