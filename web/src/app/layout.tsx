import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'przm — Signed receipts for AI memory',
    template: '%s | przm',
  },
  description:
    'Vendor-neutral, signed-receipt benchmark for AI memory servers. Deterministic scoring, public audit log, Ed25519-verified receipts. Tracks Engram, Mem0, Letta, Zep, and more.',
  metadataBase: new URL('https://bench.przm.sh'),
  openGraph: {
    type: 'website',
    siteName: 'przm',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  )
}
