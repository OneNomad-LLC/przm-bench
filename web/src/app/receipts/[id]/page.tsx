import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import { notFound } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { ReceiptFullView } from '@/components/receipt-full-view'
import type { Receipt, ReceiptSummary } from '@/types/receipt'
import { fmtDate } from '@/lib/utils'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getReceipt(id: string): Promise<Receipt | null> {
  try {
    const filePath = path.join(
      process.cwd(),
      '..',
      'results',
      'published',
      `${id}.json`,
    )
    // Note: results/ lives at the monorepo root (bench/results/published/<id>.json)
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as Receipt
  } catch {
    return null
  }
}

async function getPubKey(): Promise<string> {
  try {
    const filePath = path.join(process.cwd(), 'public', 'keys', 'receipt-signing.pub')
    return await readFile(filePath, 'utf-8')
  } catch {
    return 'placeholder'
  }
}

export async function generateStaticParams(): Promise<{ id: string }[]> {
  try {
    const filePath = path.join(process.cwd(), 'data', 'receipts.json')
    const raw = await readFile(filePath, 'utf-8')
    const summaries = JSON.parse(raw) as ReceiptSummary[]
    return summaries.map((s) => ({ id: s.id }))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const receipt = await getReceipt(id)
  if (!receipt) return { title: 'Receipt not found' }

  return {
    title: `${receipt.adapter.name} v${receipt.adapter.version} — ${receipt.fixture.id} | przm`,
    description: `Signed benchmark receipt: ${receipt.adapter.name} v${receipt.adapter.version} on ${receipt.fixture.id}. R@10: ${(receipt.scores.recall_at_10 * 100).toFixed(1)}%, NDCG@10: ${(receipt.scores.ndcg_at_10 * 100).toFixed(1)}%, p50: ${Math.round(receipt.scores.latency_p50_ms)}ms. Run ${fmtDate(receipt.ranAt)}.`,
  }
}

export default async function ReceiptPage({ params }: PageProps) {
  const { id } = await params
  const [receipt, pubKeyPem] = await Promise.all([getReceipt(id), getPubKey()])

  if (!receipt) notFound()

  return (
    <>
      <Navbar />
      <main>
        <ReceiptFullView receipt={receipt} pubKeyPem={pubKeyPem} />
      </main>
      <Footer />
    </>
  )
}
