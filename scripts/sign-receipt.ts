/**
 * scripts/sign-receipt.ts
 *
 * CI signing step. Reads tmp/receipt.json, signs it with the Ed25519
 * private key from RECEIPT_SIGNING_PRIVATE_KEY, writes tmp/receipt-signed.json.
 *
 * SECURITY:
 * - The private key is consumed once from the env var and never logged.
 * - The process exits 1 immediately if the env var is absent.
 * - No key material appears in stdout, stderr, or any written file.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// --------------------------------------------------------------------------
// Guard: fail fast if the signing key is missing
// --------------------------------------------------------------------------
const rawKey = process.env['RECEIPT_SIGNING_PRIVATE_KEY']
if (!rawKey || rawKey.trim() === '') {
  process.stderr.write(
    '[sign-receipt] RECEIPT_SIGNING_PRIVATE_KEY is not set or empty.\n' +
      'Set this secret in the GitHub repository settings under Settings > Secrets.\n',
  )
  process.exit(1)
}

// --------------------------------------------------------------------------
// Resolve paths relative to repo root (this script runs from there in CI)
// --------------------------------------------------------------------------
const repoRoot = process.cwd()
const receiptIn = join(repoRoot, 'tmp', 'receipt.json')
const receiptOut = join(repoRoot, 'tmp', 'receipt-signed.json')

// --------------------------------------------------------------------------
// Load the receipt
// --------------------------------------------------------------------------
let receiptRaw: string
try {
  receiptRaw = readFileSync(receiptIn, 'utf-8')
} catch (err) {
  process.stderr.write(
    `[sign-receipt] Could not read ${receiptIn}: ${String(err)}\n`,
  )
  process.exit(1)
}

let receipt: unknown
try {
  receipt = JSON.parse(receiptRaw)
} catch (err) {
  process.stderr.write(
    `[sign-receipt] tmp/receipt.json is not valid JSON: ${String(err)}\n`,
  )
  process.exit(1)
}

// --------------------------------------------------------------------------
// Import the sign function from src/receipt/sign.ts
// This import will fail until the other track lands src/receipt/sign.ts.
// That's expected — the bench job is allowed to fail until tracks merge.
// --------------------------------------------------------------------------
let signReceiptFn: (
  receipt: unknown,
  privateKeyPem: string,
) => Promise<unknown>

try {
  // Dynamic import so we get a useful error instead of a parse error
  // if the module doesn't exist yet.
  const mod = await import('../src/receipt/sign.js')
  if (typeof mod.signReceipt !== 'function') {
    throw new Error(
      'src/receipt/sign.ts does not export a `signReceipt` function',
    )
  }
  signReceiptFn = mod.signReceipt as typeof signReceiptFn
} catch (err) {
  process.stderr.write(
    `[sign-receipt] Could not import src/receipt/sign.ts: ${String(err)}\n` +
      'This is expected until the receipt-signing track merges.\n',
  )
  process.exit(1)
}

// --------------------------------------------------------------------------
// Sign
// --------------------------------------------------------------------------
let signed: unknown
try {
  signed = await signReceiptFn(receipt, rawKey.trim())
} catch (err) {
  process.stderr.write(
    `[sign-receipt] Signing failed: ${String(err)}\n`,
  )
  process.exit(1)
}

// --------------------------------------------------------------------------
// Write output — deterministic 2-space JSON, newline-terminated
// --------------------------------------------------------------------------
try {
  writeFileSync(receiptOut, JSON.stringify(signed, null, 2) + '\n', 'utf-8')
} catch (err) {
  process.stderr.write(
    `[sign-receipt] Could not write ${receiptOut}: ${String(err)}\n`,
  )
  process.exit(1)
}

process.stdout.write(
  `[sign-receipt] Signed receipt written to ${receiptOut}\n`,
)
