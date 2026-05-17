import { Logo } from '@/components/logo'

export function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-6 rounded-lg border border-dashed border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)]/30 px-8 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--color-border-default)]">
        <Logo size={28} />
      </div>
      <div>
        <p className="font-mono text-sm font-medium text-[color:var(--color-text-secondary)]">
          First receipt drops May 2026.
        </p>
        <p className="mt-1.5 font-mono text-xs text-[color:var(--color-text-muted)]">
          Watch the repo &mdash; receipts land on every tagged release.
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-text-disabled)]">
          Every receipt is Ed25519-signed and committed to the public audit log.
        </p>
      </div>
      <a
        href="https://github.com/OneNomad-LLC/bench"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-default)] px-5 py-2 font-mono text-xs text-[color:var(--color-text-muted)] transition-colors hover:border-[color:var(--color-bench)] hover:text-[color:var(--color-bench)]"
      >
        Watch on GitHub &rarr;
      </a>
    </div>
  )
}
