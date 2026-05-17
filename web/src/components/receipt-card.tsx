import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus, ShieldCheck } from 'lucide-react'
import type { ReceiptSummary } from '@/types/receipt'
import { cn, fmtPct, fmtMs, fmtDate } from '@/lib/utils'

interface ReceiptCardProps {
  receipt: ReceiptSummary
}

const ADAPTER_COLORS: Record<string, string> = {
  engram: 'text-[color:var(--color-aqua)]',
  mem0: 'text-[color:var(--color-purple)]',
  letta: 'text-[color:var(--color-mint)]',
  zep: 'text-[color:var(--color-orange)]',
  default: 'text-[color:var(--color-text-secondary)]',
}

const BENCHMARK_LABELS: Record<string, string> = {
  longmemeval: 'LongMemEval',
  locomo: 'LoCoMo',
}

function adapterColor(name: string): string {
  return ADAPTER_COLORS[name.toLowerCase()] ?? (ADAPTER_COLORS['default'] as string)
}

function TrendIcon({ trend }: { trend?: 'improved' | 'regressed' | 'initial' }) {
  if (trend === 'improved') {
    return <TrendingUp size={12} className="text-[color:var(--color-green)]" />
  }
  if (trend === 'regressed') {
    return <TrendingDown size={12} className="text-[color:var(--color-red)]" />
  }
  return <Minus size={12} className="text-[color:var(--color-text-disabled)]" />
}

export function ReceiptCard({ receipt }: ReceiptCardProps) {
  const benchLabel = BENCHMARK_LABELS[receipt.benchmark] ?? receipt.benchmark

  return (
    <Link
      href={`/receipts/${receipt.id}`}
      className="group block rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)] p-5 transition-colors hover:border-[color:var(--color-gold)]/60 hover:bg-[color:var(--color-bg-raised)]"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('font-mono text-sm font-semibold', adapterColor(receipt.adapter))}>
              {receipt.adapter}
            </span>
            <span className="font-mono text-xs text-[color:var(--color-text-disabled)]">
              v{receipt.version}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-text-muted)]">
            {benchLabel}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <TrendIcon trend={receipt.trend} />
          {receipt.signed && (
            <ShieldCheck size={13} className="text-[color:var(--color-green)]" />
          )}
        </div>
      </div>

      {/* Score row */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ScoreCell label="R@5" value={fmtPct(receipt.scores.recall_at_5)} accent="gold" />
        <ScoreCell label="R@10" value={fmtPct(receipt.scores.recall_at_10)} accent="gold" />
        <ScoreCell label="NDCG@10" value={fmtPct(receipt.scores.ndcg_at_10)} accent="orange" />
        <ScoreCell label="p50" value={fmtMs(receipt.scores.latency_p50_ms)} accent="muted" />
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between">
        <span className="font-mono text-[10px] text-[color:var(--color-text-disabled)]">
          {fmtDate(receipt.ranAt)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-text-disabled)] transition-colors group-hover:text-[color:var(--color-gold)]">
          view receipt &rarr;
        </span>
      </div>
    </Link>
  )
}

function ScoreCell({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: 'gold' | 'orange' | 'muted'
}) {
  const valueClass = {
    gold: 'text-[color:var(--color-gold)]',
    orange: 'text-[color:var(--color-orange)]',
    muted: 'text-[color:var(--color-text-secondary)]',
  }[accent]

  return (
    <div>
      <div className={cn('font-mono text-base font-semibold', valueClass)}>{value}</div>
      <div className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-[color:var(--color-text-disabled)]">
        {label}
      </div>
    </div>
  )
}
