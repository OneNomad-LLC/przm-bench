'use client'

import { useState } from 'react'
import { ShieldCheck, ShieldX, Shield, AlertCircle } from 'lucide-react'
import type { Receipt } from '@/types/receipt'
import { cn } from '@/lib/utils'

type VerifyResult =
  | { status: 'verified' }
  | { status: 'invalid'; reason: string }
  | { status: 'unsigned' }
  | { status: 'error'; reason: string }

/** JCS (RFC 8785) stringify */
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
      (k) =>
        `${JSON.stringify(k)}:${jcsStringify((value as Record<string, unknown>)[k])}`,
    )
    return '{' + pairs.join(',') + '}'
  }
  return JSON.stringify(value)
}

async function verifyReceiptJson(receiptJson: string, pubKeyPem: string): Promise<VerifyResult> {
  let receipt: Receipt
  try {
    receipt = JSON.parse(receiptJson) as Receipt
  } catch {
    return { status: 'error', reason: 'Invalid JSON — could not parse receipt.' }
  }

  if (!receipt.signature) {
    return { status: 'unsigned' }
  }

  if (pubKeyPem.startsWith('placeholder')) {
    return { status: 'error', reason: 'Public key not yet published for this deployment.' }
  }

  try {
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signature: _sig, ...receiptBody } = receipt
    const canonical = jcsStringify(receiptBody)
    const payloadBytes = new TextEncoder().encode(canonical)

    const sigB64 = receipt.signature.value.replace(/-/g, '+').replace(/_/g, '/')
    const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0))

    const ok = await crypto.subtle.verify('Ed25519', cryptoKey, sigBytes, payloadBytes)
    return ok ? { status: 'verified' } : { status: 'invalid', reason: 'Signature mismatch.' }
  } catch (e) {
    return {
      status: 'error',
      reason: `Verification failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

interface VerifyFormProps {
  pubKeyPem: string
  pubKeyFingerprint: string
}

export function VerifyForm({ pubKeyPem, pubKeyFingerprint }: VerifyFormProps) {
  const [json, setJson] = useState('')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleVerify() {
    if (!json.trim()) return
    setLoading(true)
    setResult(null)
    const res = await verifyReceiptJson(json.trim(), pubKeyPem)
    setResult(res)
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Public key fingerprint */}
      <div className="rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-text-muted)]">
          Signing key fingerprint
        </p>
        <code className="mt-1.5 block break-all font-mono text-xs text-[color:var(--color-text-secondary)]">
          {pubKeyFingerprint}
        </code>
        <p className="mt-2 font-mono text-[10px] text-[color:var(--color-text-disabled)]">
          Cross-check at{' '}
          <a
            href="https://github.com/OneNomad-LLC/bench/blob/main/keys/receipt-signing.pub"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[color:var(--color-bench)] hover:underline"
          >
            github.com/OneNomad-LLC/bench
          </a>
        </p>
      </div>

      {/* Textarea */}
      <div>
        <label
          htmlFor="receipt-json"
          className="mb-2 block font-mono text-xs uppercase tracking-widest text-[color:var(--color-text-muted)]"
        >
          Paste receipt JSON
        </label>
        <textarea
          id="receipt-json"
          value={json}
          onChange={(e) => {
            setJson(e.target.value)
            setResult(null)
          }}
          rows={14}
          spellCheck={false}
          className="w-full rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)] p-4 font-mono text-xs text-[color:var(--color-text-primary)] placeholder-[color:var(--color-text-disabled)] outline-none transition-colors focus:border-[color:var(--color-gold)]/60"
          placeholder={'{\n  "receiptId": "...",\n  "signature": { ... }\n}'}
        />
      </div>

      {/* Verify button */}
      <button
        onClick={handleVerify}
        disabled={!json.trim() || loading}
        style={json.trim() && !loading ? { background: 'var(--color-bench)' } : undefined}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-mono text-sm font-medium transition-all',
          json.trim() && !loading
            ? 'text-[color:var(--color-charcoal)]'
            : 'cursor-not-allowed bg-[color:var(--color-bg-raised)] text-[color:var(--color-text-disabled)]',
        )}
      >
        <Shield size={14} />
        {loading ? 'Verifying...' : 'Verify'}
      </button>

      {/* Result */}
      {result && <VerifyResultBanner result={result} />}
    </div>
  )
}

function VerifyResultBanner({ result }: { result: VerifyResult }) {
  if (result.status === 'verified') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-green)]/40 bg-[color:var(--color-green)]/10 p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[color:var(--color-green)]" />
        <div>
          <p className="font-mono text-sm font-semibold text-[color:var(--color-green)]">
            Signature verified
          </p>
          <p className="mt-1 font-mono text-xs text-[color:var(--color-text-secondary)]">
            The receipt is authentic and was signed with the przm bench private key. Scores have
            not been altered.
          </p>
        </div>
      </div>
    )
  }

  if (result.status === 'invalid') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-red)]/40 bg-[color:var(--color-red)]/10 p-4">
        <ShieldX size={18} className="mt-0.5 shrink-0 text-[color:var(--color-red)]" />
        <div>
          <p className="font-mono text-sm font-semibold text-[color:var(--color-red)]">
            Signature invalid
          </p>
          <p className="mt-1 font-mono text-xs text-[color:var(--color-text-secondary)]">
            {result.reason}
          </p>
        </div>
      </div>
    )
  }

  if (result.status === 'unsigned') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)] p-4">
        <Shield size={18} className="mt-0.5 shrink-0 text-[color:var(--color-text-muted)]" />
        <div>
          <p className="font-mono text-sm font-semibold text-[color:var(--color-text-secondary)]">
            No signature present
          </p>
          <p className="mt-1 font-mono text-xs text-[color:var(--color-text-muted)]">
            This receipt does not contain a <code className="text-[color:var(--color-gold)]">signature</code>{' '}
            field. Only receipts produced by the official CI harness are signed.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)] p-4">
      <AlertCircle size={18} className="mt-0.5 shrink-0 text-[color:var(--color-orange)]" />
      <div>
        <p className="font-mono text-sm font-semibold text-[color:var(--color-orange)]">
          Verification error
        </p>
        <p className="mt-1 font-mono text-xs text-[color:var(--color-text-secondary)]">
          {result.reason}
        </p>
      </div>
    </div>
  )
}
