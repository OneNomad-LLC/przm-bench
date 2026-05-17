import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-surface)]/30 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-start justify-between gap-4 font-mono text-xs text-[color:var(--color-text-muted)] md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              Built by{' '}
              <a
                href="https://onenomad.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-[color:var(--color-bench)]"
              >
                Matt Stvartak
              </a>
              {' '}&middot; Apache-2.0
            </span>
            <span className="text-[color:var(--color-text-disabled)]">&middot;</span>
            <a
              href="https://github.com/OneNomad-LLC/bench"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[color:var(--color-bench)]"
            >
              github.com/OneNomad-LLC/bench
            </a>
            <span className="text-[color:var(--color-text-disabled)]">&middot;</span>
            <a
              href="https://github.com/OneNomad-LLC/bench/tree/main/results/published"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[color:var(--color-bench)]"
            >
              Audit log
            </a>
            <span className="text-[color:var(--color-text-disabled)]">&middot;</span>
            <Link
              href="/methodology"
              className="transition-colors hover:text-[color:var(--color-bench)]"
            >
              Methodology
            </Link>
            <span className="text-[color:var(--color-text-disabled)]">&middot;</span>
            <Link
              href="/verify"
              className="transition-colors hover:text-[color:var(--color-bench)]"
            >
              Verify a receipt
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-bench)]"
              style={{ boxShadow: '0 0 8px var(--color-bench)' }}
            />
            <span>przm bench v0.0.1 &middot; Ed25519-signed</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
