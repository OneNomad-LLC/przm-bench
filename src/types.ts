/**
 * Onenomad Bench — vendor-neutral, signed-receipt benchmark for AI memory.
 *
 * The contract any memory system implements is small. The contract any
 * fixture provides is small. The receipt shape is precise. Everything
 * else is scoring, plumbing, or publication.
 */

import { z } from 'zod'

// ── Memory items + queries (the adapter contract surface) ───────────

export const MemoryItemSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1).max(50_000),
  metadata: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.string().datetime(), // ISO8601
})
export type MemoryItem = z.infer<typeof MemoryItemSchema>

export const RetrievedItemSchema = z.object({
  id: z.string(),
  score: z.number().min(0).max(1),
  content: z.string(),
})
export type RetrievedItem = z.infer<typeof RetrievedItemSchema>

export interface QueryOptions {
  k: number
  /** Reference date for temporal queries ("N days ago" etc.). */
  when?: Date
}

// ── Adapter contract ────────────────────────────────────────────────

export interface Adapter {
  /** Stable system identifier — "engram", "mem0", "letta", "zep", ... */
  readonly name: string
  /** SemVer of the underlying system being benched. */
  readonly version: string

  /** Bulk-load items into this adapter's fresh state. */
  ingest(items: MemoryItem[]): Promise<void>

  /** Query and return top-K retrieved items with scores. */
  query(q: string, opts: QueryOptions): Promise<RetrievedItem[]>

  /** Wipe all state. Called once per fixture. */
  reset(): Promise<void>

  /** Optional cleanup (close DB connections, kill subprocesses). */
  cleanup?(): Promise<void>
}

// ── Fixture schema (the ground-truth JSON shape) ────────────────────

export const FixtureItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.string().datetime(),
})
export type FixtureItem = z.infer<typeof FixtureItemSchema>

export const FixtureQuerySchema = z.object({
  id: z.string(),
  query: z.string().min(1),
  /** IDs that a correct system should retrieve in the top-K. */
  expectedAnswerIds: z.array(z.string()).min(1),
  /** Reference date for temporal questions. Optional. */
  when: z.string().datetime().optional(),
  /** Category label for stratified scoring (e.g. "temporal-inference"). */
  category: z.string().optional(),
})
export type FixtureQuery = z.infer<typeof FixtureQuerySchema>

export const FixtureSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  benchmark: z.string(), // "longmemeval" | "locomo" | custom
  subset: z.string().optional(), // "temporal-inference", "multi-session-preference", ...
  description: z.string().min(10).max(500),
  items: z.array(FixtureItemSchema).min(1),
  queries: z.array(FixtureQuerySchema).min(1),
  notes: z.string().optional(),
})
export type Fixture = z.infer<typeof FixtureSchema>

// ── Scoring ─────────────────────────────────────────────────────────

export interface PerQueryResult {
  queryId: string
  retrieved: string[] // IDs in rank order
  hit: boolean // any expected ID in top-K
  rank: number | null // 1-indexed rank of first matching expected ID, or null
  latencyMs: number
}

export interface Scores {
  recall_at_5: number
  recall_at_10: number
  ndcg_at_10: number
  latency_p50_ms: number
  latency_p95_ms: number
  ingest_throughput_items_per_sec: number
}

// ── Receipt schema (the signed artifact) ────────────────────────────

export const ReceiptSchema = z.object({
  receiptId: z.string().uuid(),
  benchVersion: z.string(),
  ranAt: z.string().datetime(),
  adapter: z.object({
    name: z.string(),
    version: z.string(),
  }),
  fixture: z.object({
    id: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    n: z.number().int().positive(),
  }),
  environment: z.object({
    node: z.string(),
    platform: z.string(),
    containerImage: z.string().optional(),
    git: z.object({
      commit: z.string().regex(/^[a-f0-9]{7,40}$/),
      dirty: z.boolean(),
    }),
  }),
  scores: z.object({
    recall_at_5: z.number().min(0).max(1),
    recall_at_10: z.number().min(0).max(1),
    ndcg_at_10: z.number().min(0).max(1),
    latency_p50_ms: z.number().nonnegative(),
    latency_p95_ms: z.number().nonnegative(),
    ingest_throughput_items_per_sec: z.number().nonnegative(),
  }),
  perQuery: z.array(
    z.object({
      queryId: z.string(),
      retrieved: z.array(z.string()),
      hit: z.boolean(),
      rank: z.number().int().nullable(),
      latencyMs: z.number().nonnegative(),
    }),
  ),
  /** Present only on signed receipts. */
  signature: z
    .object({
      algorithm: z.literal('Ed25519'),
      publicKeyFingerprint: z.string(),
      value: z.string(), // base64url
    })
    .optional(),
})
export type Receipt = z.infer<typeof ReceiptSchema>
