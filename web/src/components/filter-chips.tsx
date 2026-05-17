'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ReceiptSummary } from '@/types/receipt'
import { ReceiptCard } from '@/components/receipt-card'
import { EmptyState } from '@/components/empty-state'

const ADAPTERS = ['all', 'engram', 'mem0', 'letta', 'zep']
const BENCHMARKS = ['all', 'longmemeval', 'locomo']
const STATUSES: Array<'all' | 'improved' | 'regressed' | 'initial'> = [
  'all',
  'improved',
  'regressed',
  'initial',
]

const BENCHMARK_LABELS: Record<string, string> = {
  all: 'All benchmarks',
  longmemeval: 'LongMemEval',
  locomo: 'LoCoMo',
}

const ADAPTER_LABELS: Record<string, string> = {
  all: 'All adapters',
  engram: 'Engram',
  mem0: 'Mem0',
  letta: 'Letta',
  zep: 'Zep',
}

const STATUS_LABELS: Record<string, string> = {
  all: 'All runs',
  improved: 'Improved',
  regressed: 'Regressed',
  initial: 'Initial',
}

interface FilterChipsProps {
  receipts: ReceiptSummary[]
}

export function FilterChips({ receipts }: FilterChipsProps) {
  const [adapter, setAdapter] = useState('all')
  const [benchmark, setBenchmark] = useState('all')
  const [status, setStatus] = useState<'all' | 'improved' | 'regressed' | 'initial'>('all')

  const filtered = receipts.filter((r) => {
    if (adapter !== 'all' && r.adapter.toLowerCase() !== adapter) return false
    if (benchmark !== 'all' && r.benchmark.toLowerCase() !== benchmark) return false
    if (status !== 'all' && r.trend !== status) return false
    return true
  })

  return (
    <div>
      {/* Filter rows */}
      <div className="mb-6 flex flex-col gap-3">
        <ChipRow
          label="Adapter"
          options={ADAPTERS}
          value={adapter}
          onChange={setAdapter}
          labelMap={ADAPTER_LABELS}
        />
        <ChipRow
          label="Benchmark"
          options={BENCHMARKS}
          value={benchmark}
          onChange={setBenchmark}
          labelMap={BENCHMARK_LABELS}
        />
        <ChipRow
          label="Status"
          options={STATUSES}
          value={status}
          onChange={(v) => setStatus(v as typeof status)}
          labelMap={STATUS_LABELS}
        />
      </div>

      {/* Result count */}
      {receipts.length > 0 && (
        <p className="mb-5 font-mono text-xs text-[color:var(--color-text-muted)]">
          {filtered.length} of {receipts.length} receipts
        </p>
      )}

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length > 0 ? (
          filtered.map((r) => <ReceiptCard key={r.id} receipt={r} />)
        ) : receipts.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="col-span-full py-12 text-center font-mono text-sm text-[color:var(--color-text-muted)]">
            No receipts match the selected filters.
          </div>
        )}
      </div>
    </div>
  )
}

function ChipRow({
  label,
  options,
  value,
  onChange,
  labelMap,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
  labelMap: Record<string, string>
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-text-disabled)]">
        {label}
      </span>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'rounded-full border px-3 py-1 font-mono text-xs transition-colors',
            value === opt
              ? 'border-[color:var(--color-gold)]/60 bg-[color:var(--color-gold)]/10 text-[color:var(--color-gold)]'
              : 'border-[color:var(--color-border-default)] text-[color:var(--color-text-muted)] hover:border-[color:var(--color-gold)]/40 hover:text-[color:var(--color-text-secondary)]',
          )}
        >
          {labelMap[opt] ?? opt}
        </button>
      ))}
    </div>
  )
}
