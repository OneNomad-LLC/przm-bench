import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { FilterChips } from '@/components/filter-chips'
import type { ReceiptSummary } from '@/types/receipt'

export const metadata: Metadata = {
  title: 'Bench — Signed receipts for AI memory',
}

async function getReceipts(): Promise<ReceiptSummary[]> {
  try {
    const filePath = path.join(process.cwd(), 'data', 'receipts.json')
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as ReceiptSummary[]
  } catch {
    return []
  }
}

export default async function HomePage() {
  const receipts = await getReceipts()

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-28">
        {/* Hero */}
        <section className="relative mb-16">
          {/* Terminal grid bg */}
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.025]"
            style={{
              backgroundImage:
                'linear-gradient(var(--color-text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--color-text-primary) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)]/60 px-3 py-1 text-[color:var(--color-text-secondary)]">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-green)]"
                style={{ boxShadow: '0 0 8px var(--color-green)' }}
              />
              Ed25519-signed receipts
            </span>
            <span className="rounded-full border border-[color:var(--color-gold)]/30 bg-[color:var(--color-gold)]/10 px-3 py-1 text-[color:var(--color-gold)]">
              Apache 2.0
            </span>
            <span className="rounded-full border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)]/60 px-3 py-1 text-[color:var(--color-text-secondary)]">
              No LLM judge
            </span>
            <span className="rounded-full border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)]/60 px-3 py-1 text-[color:var(--color-text-secondary)]">
              Deterministic scoring
            </span>
          </div>

          <h1 className="mt-6 font-mono text-4xl font-semibold leading-tight tracking-tight text-[color:var(--color-text-primary)] md:text-5xl">
            Signed receipts for{' '}
            <span className="relative text-[color:var(--color-gold)]">
              AI memory
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-1 inset-y-1 -z-10 rounded-md blur-xl"
                style={{ background: 'rgba(250,189,47,0.12)' }}
              />
            </span>
            .
            <br />
            Every benchmark. Every release.
          </h1>

          <p className="mt-5 max-w-2xl font-mono text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
            Vendor-neutral, Ed25519-signed benchmark receipts. Deterministic R@K and NDCG scoring
            &mdash; no LLM anywhere in the grading loop. Every receipt is committed to the public
            audit log and verifiable against the public key in-repo.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/OneNomad-LLC/bench"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[color:var(--color-gold)] px-5 py-2.5 font-mono text-xs font-semibold text-[color:var(--color-charcoal)] transition-colors hover:bg-[color:var(--color-gold-bright)]"
            >
              View on GitHub &rarr;
            </a>
            <a
              href="/methodology"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-default)] px-5 py-2.5 font-mono text-xs text-[color:var(--color-text-muted)] transition-colors hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)]"
            >
              Methodology
            </a>
            <a
              href="/verify"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-default)] px-5 py-2.5 font-mono text-xs text-[color:var(--color-text-muted)] transition-colors hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)]"
            >
              Verify a receipt
            </a>
          </div>

          {/* Tagline bar */}
          <div className="mt-8 inline-flex max-w-2xl flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border-l-2 border-[color:var(--color-orange)] bg-[color:var(--color-bg-surface)]/40 px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
            <span className="text-[color:var(--color-orange)]">&#9658;</span>
            <span>Tracks</span>
            <span className="text-[color:var(--color-aqua)]">Engram</span>
            <span>&middot;</span>
            <span className="text-[color:var(--color-purple)]">Mem0</span>
            <span>&middot;</span>
            <span className="text-[color:var(--color-mint)]">Letta</span>
            <span>&middot;</span>
            <span className="text-[color:var(--color-orange)]">Zep</span>
            <span>&middot;</span>
            <span className="text-[color:var(--color-text-secondary)]">MemPalace &middot; HippoRAG</span>
            <span className="text-[color:var(--color-text-disabled)]">continuously.</span>
          </div>
        </section>

        {/* Receipt grid with filters */}
        <section>
          <h2 className="mb-6 font-mono text-xs font-semibold uppercase tracking-widest text-[color:var(--color-text-muted)]">
            // Receipt ledger
          </h2>
          <FilterChips receipts={receipts} />
        </section>
      </main>
      <Footer />
    </>
  )
}
