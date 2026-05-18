/**
 * JCS-style (RFC 8785) JSON canonicalization, sufficient for our
 * receipt schema. Produces a deterministic UTF-8 byte string from any
 * JSON-serializable value. Rules:
 *  - Object keys are sorted by JS `<`/`>` on the string, which is UTF-16
 *    code-unit order. RFC 8785 §3.2.3 mandates UTF-8 code-point order;
 *    the two agree for any string in the Basic Multilingual Plane
 *    (U+0000..U+FFFF). All current receipt key names are ASCII so this
 *    deviation has zero observable effect. If we ever add non-BMP key
 *    names, this needs to switch to true code-point order.
 *  - No whitespace between tokens.
 *  - Numbers use the IEEE 754 double → string mapping defined by ES
 *    JSON.stringify (compliant with RFC 8785 §3.2.2 for finite values).
 *    NaN and Infinity are not valid JSON; they would emit `null` here,
 *    which is a divergence from the spec's "reject" requirement. Our
 *    receipt schemas reject these values at the Zod layer before this
 *    function ever sees them.
 *  - Arrays preserve element order.
 *  - null / boolean / string handled by native JSON.stringify.
 *
 * Used by both sign.ts and verify.ts so they agree on the exact bytes
 * fed to the Ed25519 primitive.
 */

/** A value that can be round-tripped through JSON without loss. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

/**
 * Canonicalize `value` per RFC 8785 JCS.
 * Returns a UTF-8 string (no BOM, no trailing newline).
 */
export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    // JSON.stringify handles null, boolean, and number (IEEE 754 → ES notation)
    return JSON.stringify(value)
  }

  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    const elements = value.map((v) => canonicalize(v as JsonValue))
    return '[' + elements.join(',') + ']'
  }

  // Object: sort keys by Unicode code-point order (same as String.prototype.localeCompare
  // with no locale — we need raw code-point order, which is what < / > give us on strings)
  const keys = Object.keys(value).sort((a, b) => {
    // RFC 8785 §3.2.3: keys are sorted by their Unicode scalar values
    if (a < b) return -1
    if (a > b) return 1
    return 0
  })

  const members = keys.map((k) => {
    const encodedKey = JSON.stringify(k)
    const encodedVal = canonicalize((value as Record<string, JsonValue>)[k] as JsonValue)
    return encodedKey + ':' + encodedVal
  })

  return '{' + members.join(',') + '}'
}

/**
 * Encode the canonicalized form as a Buffer of UTF-8 bytes.
 * This is the byte sequence passed to the Ed25519 sign/verify primitive.
 */
export function canonicalizeToBytes(value: JsonValue): Buffer {
  return Buffer.from(canonicalize(value), 'utf8')
}

/**
 * Fields excluded from the canonical payload that gets signed.
 *
 * Why these specific fields:
 *  - `signature`: the signature obviously can't sign over itself
 *  - `ranAt`: wall-clock timestamp varies across runs of the same code
 *    against the same fixture; including it would make signatures
 *    non-deterministic
 *  - `receiptId`: random UUID minted per run; same justification as ranAt
 *  - `latency_p50_ms` / `latency_p95_ms` / `ingest_throughput_items_per_sec`:
 *    wall-clock measurements that vary across runs even when scores are
 *    identical (different hardware, different system load). Sit alongside
 *    `scores` in memory receipts; we strip them before signing while
 *    keeping them in the receipt JSON for context.
 *
 * Result: same fixture + same code + same adapter version + same model
 * → same signed bytes → same signature. That's what makes the
 * "anyone can re-run and verify byte-identical" claim true.
 *
 * The fields are PRESENT in the receipt JSON (so consumers can see when
 * the run happened, how fast it was, etc) — they're just not COVERED by
 * the signature. Tampering with them after signing doesn't invalidate
 * the signature; that's the intentional tradeoff.
 */
const NON_DETERMINISTIC_FIELDS = new Set([
  'signature',
  'ranAt',
  'receiptId',
])
const NON_DETERMINISTIC_SCORE_FIELDS = new Set([
  'latency_p50_ms',
  'latency_p95_ms',
  'ingest_throughput_items_per_sec',
])

function stripNonDeterministic(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }
  const out: { [key: string]: JsonValue } = {}
  for (const [k, v] of Object.entries(value)) {
    if (NON_DETERMINISTIC_FIELDS.has(k)) continue
    if (k === 'scores' && v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const cleanScores: { [key: string]: JsonValue } = {}
      for (const [sk, sv] of Object.entries(v as { [key: string]: JsonValue })) {
        if (NON_DETERMINISTIC_SCORE_FIELDS.has(sk)) continue
        cleanScores[sk] = sv
      }
      out[k] = cleanScores
      continue
    }
    out[k] = v
  }
  return out
}

/**
 * Canonicalize a receipt for signing/verifying, with non-deterministic
 * fields excluded. Same input (modulo those fields) → same bytes →
 * same signature.
 *
 * Use this — not `canonicalizeToBytes` — anywhere you're computing
 * the bytes the Ed25519 primitive operates on for a receipt.
 */
export function canonicalizeReceiptForSigning(receipt: JsonValue): Buffer {
  return Buffer.from(canonicalize(stripNonDeterministic(receipt)), 'utf8')
}
