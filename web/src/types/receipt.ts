/**
 * Web-facing receipt types. Kept minimal — the authoritative Zod schema
 * lives in the bench runner (../src/types.ts). These are plain TS interfaces
 * for the frontend to consume without pulling in zod or the full runner.
 */

export interface ReceiptAdapter {
  name: string
  version: string
}

export interface ReceiptFixture {
  id: string
  sha256: string
  n: number
}

export interface ReceiptEnvironment {
  node: string
  platform: string
  containerImage?: string
  git: {
    commit: string
    dirty: boolean
  }
}

export interface ReceiptScores {
  recall_at_5: number
  recall_at_10: number
  ndcg_at_10: number
  latency_p50_ms: number
  latency_p95_ms: number
  ingest_throughput_items_per_sec: number
}

export interface PerQueryResult {
  queryId: string
  retrieved: string[]
  hit: boolean
  rank: number | null
  latencyMs: number
}

export interface ReceiptSignature {
  algorithm: 'Ed25519'
  publicKeyFingerprint: string
  value: string // base64url
}

export interface Receipt {
  receiptId: string
  benchVersion: string
  ranAt: string // ISO8601
  adapter: ReceiptAdapter
  fixture: ReceiptFixture
  environment: ReceiptEnvironment
  scores: ReceiptScores
  perQuery: PerQueryResult[]
  signature?: ReceiptSignature
}

/** Lean summary row written by the CI workflow into data/receipts.json */
export interface ReceiptSummary {
  id: string
  adapter: string
  version: string
  benchmark: string
  ranAt: string // ISO8601
  scores: {
    recall_at_5: number
    recall_at_10: number
    ndcg_at_10: number
    latency_p50_ms: number
    latency_p95_ms: number
    ingest_throughput_items_per_sec: number
  }
  /** Trend vs previous run for this adapter+benchmark combination */
  trend?: 'improved' | 'regressed' | 'initial'
  signed: boolean
}
