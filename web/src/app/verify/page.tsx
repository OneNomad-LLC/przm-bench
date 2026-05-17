import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import crypto from 'node:crypto'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { VerifyForm } from '@/components/verify-form'

export const metadata: Metadata = {
  title: 'Verify a receipt | Bench',
  description:
    'Paste any Onenomad Bench receipt JSON and verify its Ed25519 signature in your browser — no server roundtrip.',
}

async function getPubKeyPem(): Promise<string> {
  try {
    const filePath = path.join(process.cwd(), 'public', 'keys', 'receipt-signing.pub')
    return await readFile(filePath, 'utf-8')
  } catch {
    return 'placeholder'
  }
}

async function getPubKeyFingerprint(pem: string): Promise<string> {
  if (pem.startsWith('placeholder')) return 'sha256:not-yet-available'
  try {
    const b64 = pem
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s+/g, '')
    const keyBytes = Buffer.from(b64, 'base64')
    const hash = crypto.createHash('sha256').update(keyBytes).digest('hex')
    return `sha256:${hash}`
  } catch {
    return 'sha256:unknown'
  }
}

export default async function VerifyPage() {
  const pubKeyPem = await getPubKeyPem()
  const fingerprint = await getPubKeyFingerprint(pubKeyPem)

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-6 pb-20 pt-28">
        <div className="mb-10">
          <div className="mb-4 font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-text-muted)]">
            // verify
          </div>
          <h1 className="font-mono text-3xl font-semibold text-[color:var(--color-text-primary)]">
            Verify a receipt
          </h1>
          <p className="mt-4 font-mono text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
            Paste any signed receipt JSON below. Verification runs entirely in your browser using
            SubtleCrypto &mdash; no data leaves your machine.
          </p>
        </div>

        <VerifyForm pubKeyPem={pubKeyPem} pubKeyFingerprint={fingerprint} />

        <div className="mt-12 rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)] p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-text-muted)]">
            CLI equivalent
          </p>
          <pre className="mt-2 font-mono text-xs text-[color:var(--color-text-secondary)]">
            <code>{`npx @onenomad/bench verify <receipt-file>.json`}</code>
          </pre>
          <p className="mt-3 font-mono text-xs text-[color:var(--color-text-disabled)]">
            Or programmatically:{' '}
            <code className="text-[color:var(--color-gold)]">
              import {'{ verifyReceipt, loadPublicKey }'} from &apos;@onenomad/bench&apos;
            </code>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
