/**
 * RFC 8785 JCS (JSON Canonicalization Scheme) implementation.
 *
 * Produces a deterministic UTF-8 byte string from any JSON-serializable
 * value. Rules:
 *  - Object keys are sorted lexicographically (Unicode code-point order)
 *  - No whitespace between tokens
 *  - Numbers use the IEEE 754 double → string mapping defined by ES JSON.stringify
 *    (which is already compliant with RFC 8785 §3.2.2 for finite values)
 *  - Arrays preserve element order
 *  - null / boolean / string handled by native JSON.stringify
 *
 * Used by both sign.ts and verify.ts so they agree on the exact bytes
 * that are fed to the Ed25519 primitive.
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
