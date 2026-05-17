import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { FilterChips } from '@/components/filter-chips'
import type { ReceiptSummary } from '@/types/receipt'

export const metadata: Metadata = {
  title: 'przm — Signed receipts for AI memory',
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
                className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-bench)]"
                style={{ boxShadow: '0 0 8px var(--color-bench)' }}
              />
              Ed25519-signed receipts
            </span>
            <span className="rounded-full border border-[color:var(--color-bench)]/30 bg-[color:var(--color-bench)]/10 px-3 py-1 text-[color:var(--color-bench)]">
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
            The spectrum of{' '}
            <span className="relative" style={{ color: 'var(--color-memory)' }}>
              AI memory
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-1 inset-y-1 -z-10 rounded-md blur-xl"
                style={{ background: 'rgba(232,64,64,0.10)' }}
              />
            </span>{' '}
            performance.
            <br />
            Measured. Receipted. Verifiable.
          </h1>

          <p className="mt-5 max-w-2xl font-mono text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
            przm runs deterministic R@K and NDCG scoring against a SHA-pinned fixture &mdash; no
            LLM anywhere in the grading loop. Every result is Ed25519-signed and committed to the
            public audit log. Engram scored{' '}
            <span style={{ color: 'var(--color-bench)' }}>91.9% R@10 on LoCoMo</span>. Every
            number you see here has a receipt behind it.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/OneNomad-LLC/bench"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-mono text-xs font-semibold text-[color:var(--color-charcoal)] transition-colors"
              style={{ background: 'var(--color-bench)' }}
            >
              View on GitHub &rarr;
            </a>
            <a
              href="/methodology"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-default)] px-5 py-2.5 font-mono text-xs text-[color:var(--color-text-muted)] transition-colors hover:border-[color:var(--color-bench)] hover:text-[color:var(--color-bench)]"
            >
              Methodology
            </a>
            <a
              href="/verify"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-default)] px-5 py-2.5 font-mono text-xs text-[color:var(--color-text-muted)] transition-colors hover:border-[color:var(--color-bench)] hover:text-[color:var(--color-bench)]"
            >
              Verify a receipt
            </a>
          </div>

          {/* Module tracker bar */}
          <div className="mt-8 inline-flex max-w-2xl flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border-l-2 border-[color:var(--color-bench)] bg-[color:var(--color-bg-surface)]/40 px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
            <span style={{ color: 'var(--color-bench)' }}>&#9658;</span>
            <span>Tracks</span>
            <span style={{ color: 'var(--color-memory)' }}>Engram</span>
            <span>&middot;</span>
            <span style={{ color: 'var(--color-voice)' }}>Mem0</span>
            <span>&middot;</span>
            <span style={{ color: 'var(--color-knowledge)' }}>Letta</span>
            <span>&middot;</span>
            <span style={{ color: 'var(--color-runtime)' }}>Zep</span>
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
