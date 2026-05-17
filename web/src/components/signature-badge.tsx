'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldX, Shield } from 'lucide-react'
import type { Receipt } from '@/types/receipt'
import { cn } from '@/lib/utils'

type VerifyState = 'pending' | 'verified' | 'invalid' | 'unsigned' | 'error'

interface SignatureBadgeProps {
  receipt: Receipt
  /** Raw PEM text of the Ed25519 public key */
  pubKeyPem: string
}

/**
 * Parses the Ed25519 public key from PEM format and verifies the receipt
 * signature using SubtleCrypto. The signature covers the receipt body with the
 * `signature` field omitted, JCS-canonicalized (RFC 8785: sorted keys, no
 * whitespace).
 */
async function verifyReceipt(receipt: Receipt, pubKeyPem: string): Promise<boolean> {
  if (!receipt.signature) return false

  // Strip PEM headers and decode base64
  const b64 = pubKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '')

  const keyBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    keyBytes,
    { name: 'Ed25519' },
    false,
    ['verify'],
  )

  // Reconstruct the signed payload: receipt without the signature field, JCS
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature: _sig, ...receiptBody } = receipt
  const canonical = jcsStringify(receiptBody)
  const payloadBytes = new TextEncoder().encode(canonical)

  // Decode base64url signature value
  const sigB64 = receipt.signature.value.replace(/-/g, '+').replace(/_/g, '/')
  const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0))

  return crypto.subtle.verify('Ed25519', cryptoKey, sigBytes, payloadBytes)
}

/**
 * Minimal JCS (RFC 8785) stringify: recursively sorts object keys, no
 * whitespace. Handles the receipt shape — strings, numbers, booleans, null,
 * arrays, and objects.
 */
function jcsStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(jcsStringify).join(',') + ']'
  }
  if (typeof value === 'object') {
    const sorted = Object.keys(value as Record<string, unknown>).sort()
    const pairs = sorted.map(
      (k) => `${JSON.stringify(k)}:${jcsStringify((value as Record<string, unknown>)[k])}`,
    )
    return '{' + pairs.join(',') + '}'
  }
  return JSON.stringify(value)
}

export function SignatureBadge({ receipt, pubKeyPem }: SignatureBadgeProps) {
  const [state, setState] = useState<VerifyState>('pending')

  useEffect(() => {
    if (!receipt.signature) {
      setState('unsigned')
      return
    }
    // Skip if pubkey is the placeholder
    if (pubKeyPem.startsWith('placeholder')) {
      setState('error')
      return
    }

    verifyReceipt(receipt, pubKeyPem)
      .then((ok) => setState(ok ? 'verified' : 'invalid'))
      .catch(() => setState('error'))
  }, [receipt, pubKeyPem])

  if (state === 'pending') {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border-default)] px-3 py-1.5 font-mono text-xs text-[color:var(--color-text-muted)]">
        <Shield size={12} />
        Verifying&hellip;
      </div>
    )
  }

  if (state === 'verified') {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-green)]/40 bg-[color:var(--color-green)]/10 px-3 py-1.5 font-mono text-xs text-[color:var(--color-green)]">
        <ShieldCheck size={12} />
        Signature verified
      </div>
    )
  }

  if (state === 'unsigned') {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border-default)] px-3 py-1.5 font-mono text-xs text-[color:var(--color-text-muted)]">
        <Shield size={12} />
        Unsigned receipt
      </div>
    )
  }

  if (state === 'invalid') {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-red)]/40 bg-[color:var(--color-red)]/10 px-3 py-1.5 font-mono text-xs text-[color:var(--color-red)]">
        <ShieldX size={12} />
        Signature invalid
      </div>
    )
  }

  // error — key not yet published or SubtleCrypto unsupported
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border-default)] px-3 py-1.5 font-mono text-xs text-[color:var(--color-text-muted)]">
      <Shield size={12} />
      Verification unavailable
    </div>
  )
}

export type { VerifyState }
