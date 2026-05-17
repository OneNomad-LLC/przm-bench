import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { FilterChips } from '@/components/filter-chips'
import type { ReceiptSummary } from '@/types/receipt'

export const metadata: Metadata = {
  title: 'przm — Vendor-neutral AI reliability benchmarks',
  description:
    'Signed, reproducible, adversarial benchmarks for AI failure modes that do not have standards yet. Multi-agent convergence. Memory recall. Code review reliability.',
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
            AI{' '}
            <span className="relative" style={{ color: 'var(--color-memory)' }}>
              reliability
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-1 inset-y-1 -z-10 rounded-md blur-xl"
                style={{ background: 'rgba(232,64,64,0.10)' }}
              />
            </span>
            , measured.
            <br />
            Signed. Reproducible. Adversarial.
          </h1>

          <p className="mt-5 max-w-2xl font-mono text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
            We publish vendor-neutral benchmarks for AI failure modes that don't have standards
            yet. Multi-agent debates that collapse to confidently wrong answers. Memory systems
            that forget the things you need. Code review tools that miss what they should catch.
            Deterministic scoring &mdash;{' '}
            <span style={{ color: 'var(--color-bench)' }}>no LLM judge anywhere</span> &mdash;
            and every result is an Ed25519-signed receipt that anyone can verify.
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

          {/* Benchmark family tracker */}
          <div className="mt-8 grid max-w-3xl gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)]/40 p-4 font-mono text-xs">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: 'var(--color-bench)',
                    boxShadow: '0 0 8px var(--color-bench)',
                  }}
                />
                <span className="uppercase tracking-widest text-[color:var(--color-text-muted)]">
                  v0.1 &middot; headline
                </span>
              </div>
              <div className="mb-1 text-[color:var(--color-text-primary)]">
                Multi-agent convergence
              </div>
              <div className="text-[color:var(--color-text-secondary)]">
                CrewAI &middot; AutoGen &middot; LangGraph &middot; Claude Agents SDK &middot;
                OpenAI Swarm
              </div>
            </div>
            <div className="rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)]/40 p-4 font-mono text-xs">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--color-memory)' }}
                />
                <span className="uppercase tracking-widest text-[color:var(--color-text-muted)]">
                  live
                </span>
              </div>
              <div className="mb-1 text-[color:var(--color-text-primary)]">AI memory recall</div>
              <div className="text-[color:var(--color-text-secondary)]">
                Engram &middot; Mem0 &middot; Letta &middot; Zep &middot; MemPalace
              </div>
            </div>
            <div className="rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)]/40 p-4 font-mono text-xs">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--color-text-disabled)' }}
                />
                <span className="uppercase tracking-widest text-[color:var(--color-text-muted)]">
                  next
                </span>
              </div>
              <div className="mb-1 text-[color:var(--color-text-primary)]">
                AI code review reliability
              </div>
              <div className="text-[color:var(--color-text-secondary)]">
                Snyk &middot; Semgrep &middot; CodeRabbit &middot; Cursor Security Reviewer
              </div>
            </div>
          </div>
        </section>

        {/* Receipt grid with filters */}
        <section>
          <h2 className="mb-6 font-mono text-xs font-semibold uppercase tracking-widest text-[color:var(--color-text-muted)]">
            // Receipt ledger
          </h2>
          <FilterChips receipts={receipts} />
        </section>

        {/* For vendors */}
        <section className="mt-20 rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)]/40 p-8">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-[color:var(--color-text-muted)]">
            // For vendors
          </h2>
          <p className="mt-4 max-w-3xl font-mono text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
            If you ship an AI framework, memory system, or code-review product,
            certify your release against przm. A signed receipt is a third-party
            performance attestation you can put on your own website. We do not
            sell the harness; we run the test.{' '}
            <a
              href="mailto:hello@onenomad.dev?subject=przm%20vendor%20certification"
              className="text-[color:var(--color-bench)] underline-offset-4 hover:underline"
            >
              hello@onenomad.dev
            </a>
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
