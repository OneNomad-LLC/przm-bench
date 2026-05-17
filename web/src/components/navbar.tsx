'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/verify', label: 'Verify' },
  { href: '/methodology', label: 'Methodology' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mobileOpen])

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-base)]/80 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-mono text-sm font-semibold tracking-tight text-[color:var(--color-text-primary)]"
          onClick={() => setMobileOpen(false)}
        >
          <span className="text-[color:var(--color-gold)]">bench</span>
          <span className="text-[color:var(--color-text-disabled)]">/</span>
          <span className="text-[color:var(--color-text-muted)] text-xs">onenomad</span>
        </Link>

        {/* Desktop nav */}
        <ul className="hidden items-center gap-6 font-mono text-xs uppercase tracking-widest text-[color:var(--color-text-muted)] sm:flex">
          {navLinks.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={isActive(pathname, l.href) ? 'page' : undefined}
                className={cn(
                  'transition-colors hover:text-[color:var(--color-gold)]',
                  isActive(pathname, l.href) && 'text-[color:var(--color-gold)]',
                )}
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <a
              href="https://github.com/OneNomad-LLC/bench"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[color:var(--color-gold)]"
            >
              GitHub
            </a>
          </li>
        </ul>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="grid h-9 w-9 place-items-center rounded-full border border-[color:var(--color-border-default)] text-[color:var(--color-text-muted)] transition-colors hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)] sm:hidden"
        >
          {mobileOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </nav>

      {/* Mobile drawer */}
      <div
        className={cn(
          'overflow-hidden border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-base)]/95 backdrop-blur-md transition-[max-height,opacity] duration-200 ease-out sm:hidden',
          mobileOpen ? 'max-h-[60vh] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="mx-auto max-w-6xl space-y-1 px-6 py-6">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'block py-2 font-mono text-sm uppercase tracking-widest transition-colors',
                isActive(pathname, l.href)
                  ? 'text-[color:var(--color-gold)]'
                  : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-gold)]',
              )}
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://github.com/OneNomad-LLC/bench"
            target="_blank"
            rel="noopener noreferrer"
            className="block py-2 font-mono text-sm uppercase tracking-widest text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-gold)]"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>
  )
}
