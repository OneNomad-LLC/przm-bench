import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus, ShieldCheck } from 'lucide-react'
import type { ReceiptSummary } from '@/types/receipt'
import { cn, fmtPct, fmtMs, fmtDate } from '@/lib/utils'

interface ReceiptCardProps {
  receipt: ReceiptSummary
}

/**
 * Module color by adapter. Bench-only receipts (all current ones) use
 * --color-bench (green). When voice/knowledge/runtime adapters appear,
 * extend this map.
 */
const ADAPTER_MODULE_COLOR: Record<string, string> = {
  engram:    'var(--color-memory)',   // red  — przm Memory
  mem0:      'var(--color-voice)',    // orange — proxied to voice slot for now
  letta:     'var(--color-knowledge)',// yellow
  zep:       'var(--color-runtime)', // blue
  default:   'var(--color-bench)',   // green — bench-verified
}

const BENCHMARK_LABELS: Record<string, string> = {
  longmemeval: 'LongMemEval',
  locomo: 'LoCoMo',
}

function adapterModuleColor(name: string): string {
  return ADAPTER_MODULE_COLOR[name.toLowerCase()] ?? (ADAPTER_MODULE_COLOR['default'] as string)
}

function TrendIcon({ trend }: { trend?: 'improved' | 'regressed' | 'initial' }) {
  if (trend === 'improved') {
    return <TrendingUp size={12} className="text-[color:var(--color-bench)]" />
  }
  if (trend === 'regressed') {
    return <TrendingDown size={12} className="text-[color:var(--color-red)]" />
  }
  return <Minus size={12} className="text-[color:var(--color-text-disabled)]" />
}

export function ReceiptCard({ receipt }: ReceiptCardProps) {
  const benchLabel = BENCHMARK_LABELS[receipt.benchmark] ?? receipt.benchmark
  const moduleColor = adapterModuleColor(receipt.adapter)

  return (
    <Link
      href={`/receipts/${receipt.id}`}
      className="group block rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)] transition-colors hover:border-[color:var(--color-bench)]/60 hover:bg-[color:var(--color-bg-raised)] overflow-hidden"
    >
      {/* Module color accent stripe */}
      <div
        className="h-[3px] w-full"
        style={{ background: moduleColor, opacity: 0.85 }}
      />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-sm font-semibold"
                style={{ color: moduleColor }}
              >
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
              <ShieldCheck size={13} className="text-[color:var(--color-bench)]" />
            )}
          </div>
        </div>

        {/* Score row */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ScoreCell label="R@5" value={fmtPct(receipt.scores.recall_at_5)} accent="bench" />
          <ScoreCell label="R@10" value={fmtPct(receipt.scores.recall_at_10)} accent="bench" />
          <ScoreCell label="NDCG@10" value={fmtPct(receipt.scores.ndcg_at_10)} accent="memory" />
          <ScoreCell label="p50" value={fmtMs(receipt.scores.latency_p50_ms)} accent="muted" />
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-[10px] text-[color:var(--color-text-disabled)]">
            {fmtDate(receipt.ranAt)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-text-disabled)] transition-colors group-hover:text-[color:var(--color-bench)]">
            view receipt &rarr;
          </span>
        </div>
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
  accent: 'bench' | 'memory' | 'muted'
}) {
  const valueStyle: React.CSSProperties = {
    bench:  { color: 'var(--color-bench)' },
    memory: { color: 'var(--color-memory)' },
    muted:  { color: 'var(--color-text-secondary)' },
  }[accent]

  return (
    <div>
      <div className={cn('font-mono text-base font-semibold')} style={valueStyle}>{value}</div>
      <div className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-[color:var(--color-text-disabled)]">
        {label}
      </div>
    </div>
  )
}
