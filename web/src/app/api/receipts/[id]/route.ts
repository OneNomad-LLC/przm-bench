import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import type { ReceiptSummary } from '@/types/receipt'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  try {
    const filePath = path.join(process.cwd(), 'data', 'receipts.json')
    const raw = await readFile(filePath, 'utf-8')
    const summaries = JSON.parse(raw) as ReceiptSummary[]
    const found = summaries.find((s) => s.id === id)
    if (!found) {
      return NextResponse.json({ error: 'receipt not found' }, { status: 404 })
    }
    return NextResponse.json(found, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch {
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
