'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Download, Terminal } from 'lucide-react'
import type { Receipt } from '@/types/receipt'
import { ScoreNumber } from '@/components/score-number'
import { SignatureBadge } from '@/components/signature-badge'
import { cn, fmtPct, fmtMs, fmtThroughput, fmtDate, shortSha } from '@/lib/utils'

interface ReceiptFullViewProps {
  receipt: Receipt
  pubKeyPem: string
}

const BENCHMARK_LABELS: Record<string, string> = {
  longmemeval: 'LongMemEval',
  locomo: 'LoCoMo',
}

export function ReceiptFullView({ receipt, pubKeyPem }: ReceiptFullViewProps) {
  const [tableOpen, setTableOpen] = useState(false)
  const benchLabel = BENCHMARK_LABELS[receipt.fixture.id.split('-')[0] ?? ''] ?? receipt.fixture.id
  const ghCommitUrl = `https://github.com/OneNomad-LLC/bench/commit/${receipt.environment.git.commit}`
  const auditUrl = `https://github.com/OneNomad-LLC/bench/blob/main/results/published/${receipt.receiptId}.json`

  function handleDownload() {
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${receipt.receiptId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const cliCommand = [
    `npx @onenomad/bench run`,
    `  --adapter ${receipt.adapter.name}@${receipt.adapter.version}`,
    `  --fixture ${receipt.fixture.id}`,
    `  --commit ${receipt.environment.git.commit}`,
    receipt.environment.containerImage
      ? `  --image ${receipt.environment.containerImage}`
      : '',
  ]
    .filter(Boolean)
    .join(' \\\n')

  return (
    <article className="mx-auto max-w-5xl px-6 pb-20 pt-28">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-text-muted)]">
          <span>{fmtDate(receipt.ranAt)}</span>
          <span>&middot;</span>
          <span>{receipt.adapter.name}</span>
          <span>v{receipt.adapter.version}</span>
          <span>&middot;</span>
          <span>{benchLabel}</span>
        </div>

        <h1 className="mt-3 font-mono text-2xl font-semibold text-[color:var(--color-text-primary)] sm:text-3xl">
          {receipt.adapter.name}{' '}
          <span className="text-[color:var(--color-gold)]">v{receipt.adapter.version}</span>
          {' '}&mdash; {benchLabel}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SignatureBadge receipt={receipt} pubKeyPem={pubKeyPem} />
          {receipt.environment.git.dirty && (
            <span className="rounded-full border border-[color:var(--color-orange)]/40 bg-[color:var(--color-orange)]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-orange)]">
              dirty tree
            </span>
          )}
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border-default)] px-3 py-1.5 font-mono text-xs text-[color:var(--color-text-muted)] transition-colors hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)]"
          >
            <Download size={12} />
            Raw JSON
          </button>
        </div>
      </div>

      {/* Big numbers */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreNumber
          value={fmtPct(receipt.scores.recall_at_5)}
          label="Recall @ 5"
          sub={`n=${receipt.fixture.n}`}
          accent="gold"
        />
        <ScoreNumber
          value={fmtPct(receipt.scores.recall_at_10)}
          label="Recall @ 10"
          sub={`n=${receipt.fixture.n}`}
          accent="gold"
        />
        <ScoreNumber
          value={fmtPct(receipt.scores.ndcg_at_10)}
          label="NDCG @ 10"
          accent="orange"
        />
        <ScoreNumber
          value={fmtMs(receipt.scores.latency_p50_ms)}
          label="Latency p50"
          sub={`p95: ${fmtMs(receipt.scores.latency_p95_ms)}`}
          accent="orange"
        />
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <ScoreNumber
          value={fmtThroughput(receipt.scores.ingest_throughput_items_per_sec)}
          label="Ingest throughput"
          accent="gold"
        />
      </div>

      {/* Audit metadata */}
      <section className="mt-12">
        <h2 className="mb-4 font-mono text-sm font-semibold uppercase tracking-widest text-[color:var(--color-text-muted)]">
          Audit metadata
        </h2>
        <div className="rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)] divide-y divide-[color:var(--color-border-subtle)]">
          <MetaRow label="Receipt ID">
            <code className="font-mono text-xs text-[color:var(--color-text-secondary)]">
              {receipt.receiptId}
            </code>
          </MetaRow>
          <MetaRow label="Bench version">
            <code className="font-mono text-xs text-[color:var(--color-text-secondary)]">
              {receipt.benchVersion}
            </code>
          </MetaRow>
          <MetaRow label="Git commit">
            <a
              href={ghCommitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-[color:var(--color-gold)] transition-colors hover:text-[color:var(--color-gold-bright)]"
            >
              {shortSha(receipt.environment.git.commit)}
              {receipt.environment.git.dirty && ' (dirty)'}
            </a>
          </MetaRow>
          <MetaRow label="Fixture SHA">
            <code className="font-mono text-xs text-[color:var(--color-text-secondary)]">
              {receipt.fixture.sha256.slice(0, 16)}&hellip;
            </code>
          </MetaRow>
          <MetaRow label="Node">
            <code className="font-mono text-xs text-[color:var(--color-text-secondary)]">
              {receipt.environment.node}
            </code>
          </MetaRow>
          <MetaRow label="Platform">
            <code className="font-mono text-xs text-[color:var(--color-text-secondary)]">
              {receipt.environment.platform}
            </code>
          </MetaRow>
          {receipt.environment.containerImage && (
            <MetaRow label="Container image">
              <code className="break-all font-mono text-xs text-[color:var(--color-text-secondary)]">
                {receipt.environment.containerImage}
              </code>
            </MetaRow>
          )}
          {receipt.signature && (
            <>
              <MetaRow label="Sig algorithm">
                <code className="font-mono text-xs text-[color:var(--color-text-secondary)]">
                  {receipt.signature.algorithm}
                </code>
              </MetaRow>
              <MetaRow label="Key fingerprint">
                <code className="break-all font-mono text-xs text-[color:var(--color-text-secondary)]">
                  {receipt.signature.publicKeyFingerprint}
                </code>
              </MetaRow>
            </>
          )}
          <MetaRow label="Audit log">
            <a
              href={auditUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-[color:var(--color-gold)] transition-colors hover:text-[color:var(--color-gold-bright)]"
            >
              results/published/{receipt.receiptId.slice(0, 8)}&hellip;.json
            </a>
          </MetaRow>
        </div>
      </section>

      {/* Reproduce */}
      <section className="mt-12">
        <h2 className="mb-4 font-mono text-sm font-semibold uppercase tracking-widest text-[color:var(--color-text-muted)]">
          Reproduce this
        </h2>
        <div className="rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)] p-5">
          <div className="mb-3 flex items-center gap-2 text-[color:var(--color-text-muted)]">
            <Terminal size={14} />
            <span className="font-mono text-xs uppercase tracking-widest">CLI</span>
          </div>
          <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-[color:var(--color-text-primary)]">
            <code>{cliCommand}</code>
          </pre>
        </div>
      </section>

      {/* Per-query table (collapsible) */}
      {receipt.perQuery.length > 0 && (
        <section className="mt-12">
          <button
            onClick={() => setTableOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)] px-5 py-4 text-left transition-colors hover:border-[color:var(--color-gold)]/40"
          >
            <span className="font-mono text-sm font-semibold uppercase tracking-widest text-[color:var(--color-text-muted)]">
              Per-query results ({receipt.perQuery.length} queries)
            </span>
            {tableOpen ? (
              <ChevronUp size={16} className="text-[color:var(--color-text-muted)]" />
            ) : (
              <ChevronDown size={16} className="text-[color:var(--color-text-muted)]" />
            )}
          </button>

          {tableOpen && (
            <div className="mt-0 overflow-x-auto rounded-b-lg border-x border-b border-[color:var(--color-border-default)] bg-[color:var(--color-bg-surface)]">
              <table className="w-full min-w-[600px] font-mono text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--color-border-subtle)] text-[color:var(--color-text-muted)]">
                    <Th>Query ID</Th>
                    <Th>Hit</Th>
                    <Th>Rank</Th>
                    <Th>Latency</Th>
                    <Th>Retrieved IDs</Th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.perQuery.map((row, i) => (
                    <tr
                      key={row.queryId}
                      className={cn(
                        'border-b border-[color:var(--color-border-subtle)] last:border-0',
                        i % 2 === 0 ? 'bg-transparent' : 'bg-[color:var(--color-bg-raised)]/30',
                      )}
                    >
                      <Td>{row.queryId}</Td>
                      <Td>
                        <span
                          className={
                            row.hit
                              ? 'text-[color:var(--color-green)]'
                              : 'text-[color:var(--color-red)]'
                          }
                        >
                          {row.hit ? 'yes' : 'no'}
                        </span>
                      </Td>
                      <Td>{row.rank ?? '—'}</Td>
                      <Td>{fmtMs(row.latencyMs)}</Td>
                      <Td>
                        <span className="text-[color:var(--color-text-disabled)]">
                          {row.retrieved.slice(0, 5).join(', ')}
                          {row.retrieved.length > 5 && ` +${row.retrieved.length - 5}`}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </article>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-36 shrink-0 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-text-muted)]">
        {label}
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest">{children}</th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-2.5 text-[color:var(--color-text-secondary)]">{children}</td>
  )
}
