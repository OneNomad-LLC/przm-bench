import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import { marked } from 'marked'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'

export const metadata: Metadata = {
  title: 'Methodology | Bench',
  description:
    'How Onenomad Bench scores a memory system: deterministic R@K and NDCG, Ed25519 signing, fixture SHA pinning, and full reproducibility spec.',
}

async function getMethodologyHtml(): Promise<string> {
  try {
    const mdPath = path.join(process.cwd(), '..', 'METHODOLOGY.md')
    // bench/METHODOLOGY.md relative to bench/web/ (cwd during build)
    const md = await readFile(mdPath, 'utf-8')
    const html = await marked(md, { gfm: true })
    return html
  } catch {
    return '<p>Methodology document not found.</p>'
  }
}

export default async function MethodologyPage() {
  const html = await getMethodologyHtml()

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-4xl px-6 pb-20 pt-28">
        <div className="mb-8">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-text-muted)]">
            // methodology
          </div>
        </div>

        <div
          className="prose-bench"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <div className="mt-16 flex flex-col gap-3 border-t border-[color:var(--color-border-subtle)] pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-[color:var(--color-text-muted)]">
            Source:{' '}
            <a
              href="https://github.com/OneNomad-LLC/bench/blob/main/METHODOLOGY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--color-gold)] transition-colors hover:text-[color:var(--color-gold-bright)]"
            >
              METHODOLOGY.md
            </a>{' '}
            in the bench repo &middot; Apache-2.0
          </p>
          <a
            href="/verify"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-default)] px-4 py-2 font-mono text-xs text-[color:var(--color-text-muted)] transition-colors hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)]"
          >
            Verify a receipt &rarr;
          </a>
        </div>
      </main>
      <Footer />
    </>
  )
}
