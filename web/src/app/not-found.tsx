import Link from 'next/link'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="font-mono text-[color:var(--color-text-disabled)] text-6xl font-semibold">
          404
        </p>
        <h1 className="mt-4 font-mono text-xl font-semibold text-[color:var(--color-text-primary)]">
          Receipt not found
        </h1>
        <p className="mt-2 font-mono text-sm text-[color:var(--color-text-muted)]">
          That receipt ID doesn&apos;t exist in the public audit log.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-default)] px-5 py-2.5 font-mono text-xs text-[color:var(--color-text-muted)] transition-colors hover:border-[color:var(--color-bench)] hover:text-[color:var(--color-bench)]"
        >
          &larr; Back to ledger
        </Link>
      </main>
      <Footer />
    </>
  )
}
