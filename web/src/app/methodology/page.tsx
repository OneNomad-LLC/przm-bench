import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import { marked } from 'marked'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'

export const metadata: Metadata = {
  title: 'Methodology | przm',
  description:
    'How przm scores AI reliability — deterministic scoring, Ed25519-signed receipts, SHA-pinned fixtures, adversarial holdouts. Methodology specs for every benchmark we publish.',
}

interface BenchmarkDoc {
  slug: string
  title: string
  status: 'headline' | 'live' | 'next'
  /** One-line summary shown in the TOC. */
  description: string
  /** Path relative to the bench repo root. */
  sourcePath: string
  html: string
}

const BENCHMARK_DOCS: Omit<BenchmarkDoc, 'html'>[] = [
  {
    slug: 'convergence',
    title: 'Multi-agent convergence',
    status: 'headline',
    description:
      'How fast a multi-agent debate collapses to a confidently-stated wrong answer when one agent is confederate-injected.',
    sourcePath: 'METHODOLOGY-CONVERGENCE.md',
  },
  {
    slug: 'memory',
    title: 'AI memory recall',
    status: 'live',
    description:
      'Deterministic R@K and NDCG on LongMemEval temporal-inference and LoCoMo, with seen + 20% holdout splits.',
    sourcePath: 'METHODOLOGY.md',
  },
]

async function loadDoc(sourcePath: string): Promise<string> {
  try {
    // page.tsx runs from web/ at build time; bench repo root is one level up
    const mdPath = path.join(process.cwd(), '..', sourcePath)
    const md = await readFile(mdPath, 'utf-8')
    return await marked(md, { gfm: true })
  } catch {
    return `<p><em>${sourcePath} not found in repo root.</em></p>`
  }
}

async function loadAllDocs(): Promise<BenchmarkDoc[]> {
  return Promise.all(
    BENCHMARK_DOCS.map(async (d) => ({ ...d, html: await loadDoc(d.sourcePath) })),
  )
}

function StatusPill({ status }: { status: BenchmarkDoc['status'] }) {
  const config = {
    headline: { label: 'v0.1 · headline', color: 'var(--color-bench)' },
    live: { label: 'live', color: 'var(--color-memory)' },
    next: { label: 'next', color: 'var(--color-text-disabled)' },
  } as const
  const { label, color } = config[status]
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-text-muted)]">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color, boxShadow: status === 'headline' ? `0 0 8px ${color}` : undefined }}
      />
      {label}
    </span>
  )
}

export default async function MethodologyPage() {
  const docs = await loadAllDocs()

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-4xl px-6 pb-20 pt-28">
        {/* Header */}
        <div className="mb-12">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-text-muted)]">
            // methodology
          </div>
          <h1 className="font-mono text-3xl font-semibold leading-tight tracking-tight text-[color:var(--color-text-primary)] md:text-4xl">
            How we measure
          </h1>
          <p className="mt-4 max-w-2xl font-mono text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
            Every przm benchmark follows the same four rules: deterministic
            scoring (no LLM judge in the grading loop), Ed25519-signed receipts,
            SHA-pinned fixtures, adversarial holdout splits. The per-benchmark
            specs below document exactly what gets measured and how.
          </p>
        </div>

        {/* Cross-cutting principles */}
        <section className="mb-16 rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)]/40 p-6">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-[color:var(--color-text-muted)]">
            // principles that apply to every benchmark
          </h2>
          <ul className="mt-4 space-y-3 font-mono text-sm text-[color:var(--color-text-secondary)]">
            <li>
              <span className="text-[color:var(--color-text-primary)]">Deterministic scoring.</span>{' '}
              Two runs of the same fixture against the same adapter version produce byte-identical
              scores. No LLM judge anywhere in the grading loop &mdash; scoring is pure-function
              math on system state.
            </li>
            <li>
              <span className="text-[color:var(--color-text-primary)]">Signed.</span> Every receipt
              is signed with Ed25519. Public key is in the repo at{' '}
              <code className="rounded bg-[color:var(--color-bg-elevated)] px-1.5 py-0.5 text-xs">
                keys/receipt-signing.pub
              </code>
              . The private key lives only in a GitHub Actions secret; it never enters source,
              agent context, or any other surface.
            </li>
            <li>
              <span className="text-[color:var(--color-text-primary)]">Reproducible.</span>{' '}
              Container image hash, fixture SHA-256, model versions, and adapter versions all
              pinned in the receipt. Anyone can re-run.
            </li>
            <li>
              <span className="text-[color:var(--color-text-primary)]">Adversarially constructed.</span>{' '}
              Holdout subsets are reserved from anyone vendor-side. Blind re-implementations are
              published alongside primary adapters. Fixtures are designed to break things, not to
              flatter them.
            </li>
            <li>
              <span className="text-[color:var(--color-text-primary)]">Public audit log.</span>{' '}
              Every receipt is committed to{' '}
              <code className="rounded bg-[color:var(--color-bg-elevated)] px-1.5 py-0.5 text-xs">
                results/published/
              </code>
              . Once committed, never edited &mdash; only superseded by a new receipt with a new
              ID.
            </li>
          </ul>
        </section>

        {/* TOC */}
        <section className="mb-16">
          <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-[color:var(--color-text-muted)]">
            // benchmarks
          </h2>
          <div className="grid gap-3">
            {docs.map((doc) => (
              <a
                key={doc.slug}
                href={`#${doc.slug}`}
                className="group flex flex-col gap-2 rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)]/40 p-5 transition-colors hover:border-[color:var(--color-bench)]"
              >
                <div className="flex items-center justify-between">
                  <StatusPill status={doc.status} />
                  <span className="font-mono text-xs text-[color:var(--color-text-muted)] transition-colors group-hover:text-[color:var(--color-bench)]">
                    Read &darr;
                  </span>
                </div>
                <div className="font-mono text-base text-[color:var(--color-text-primary)]">
                  {doc.title}
                </div>
                <div className="font-mono text-xs leading-relaxed text-[color:var(--color-text-secondary)]">
                  {doc.description}
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Each benchmark's full methodology */}
        {docs.map((doc, i) => (
          <section
            key={doc.slug}
            id={doc.slug}
            className={`scroll-mt-24 ${i > 0 ? 'mt-20 border-t border-[color:var(--color-border-subtle)] pt-16' : ''}`}
          >
            <div className="mb-6 flex items-center justify-between">
              <StatusPill status={doc.status} />
              <a
                href={`https://github.com/OneNomad-LLC/bench/blob/main/${doc.sourcePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-[color:var(--color-text-muted)] transition-colors hover:text-[color:var(--color-bench)]"
              >
                {doc.sourcePath} &rarr;
              </a>
            </div>
            <div
              className="prose-bench"
              dangerouslySetInnerHTML={{ __html: doc.html }}
            />
          </section>
        ))}

        {/* Footer CTAs */}
        <div className="mt-20 flex flex-col gap-3 border-t border-[color:var(--color-border-subtle)] pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-[color:var(--color-text-muted)]">
            All methodology docs are canonical in the{' '}
            <a
              href="https://github.com/OneNomad-LLC/bench"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--color-bench)] transition-colors hover:underline"
            >
              przm bench repo
            </a>{' '}
            &middot; Apache-2.0
          </p>
          <a
            href="/verify"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-default)] px-4 py-2 font-mono text-xs text-[color:var(--color-text-muted)] transition-colors hover:border-[color:var(--color-bench)] hover:text-[color:var(--color-bench)]"
          >
            Verify a receipt &rarr;
          </a>
        </div>
      </main>
      <Footer />
    </>
  )
}
