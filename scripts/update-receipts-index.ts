/**
 * scripts/update-receipts-index.ts
 *
 * Appends a one-line summary of a newly signed receipt to the
 * web/data/receipts.json index. Reads the existing array, appends,
 * sorts by ranAt descending, and limits to the last 100 entries.
 *
 * Usage:
 *   node --import tsx scripts/update-receipts-index.ts \
 *     <receipt-path> <index-path>
 *
 * Example:
 *   node --import tsx scripts/update-receipts-index.ts \
 *     tmp/receipt-signed.json web/data/receipts.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------
const [, , receiptPath, indexPath] = process.argv

if (!receiptPath || !indexPath) {
  process.stderr.write(
    'Usage: update-receipts-index.ts <receipt-path> <index-path>\n',
  )
  process.exit(1)
}

// --------------------------------------------------------------------------
// Load the signed receipt
// --------------------------------------------------------------------------
let receipt: {
  receiptId: string
  ranAt: string
  benchVersion: string
  adapter: { name: string; version: string }
  fixture: { id: string; sha256: string; n: number }
  scores: {
    recall_at_5: number
    recall_at_10: number
    ndcg_at_10: number
    latency_p50_ms: number
    latency_p95_ms: number
    ingest_throughput_items_per_sec: number
  }
  signature?: { publicKeyFingerprint: string }
}

try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf-8'))
} catch (err) {
  process.stderr.write(
    `[update-receipts-index] Could not read receipt at ${receiptPath}: ${String(err)}\n`,
  )
  process.exit(1)
}

// --------------------------------------------------------------------------
// Build the summary entry
// --------------------------------------------------------------------------
const entry = {
  receiptId: receipt.receiptId,
  ranAt: receipt.ranAt,
  benchVersion: receipt.benchVersion,
  adapter: {
    name: receipt.adapter.name,
    version: receipt.adapter.version,
  },
  fixture: {
    id: receipt.fixture.id,
    n: receipt.fixture.n,
  },
  scores: {
    recall_at_5: receipt.scores.recall_at_5,
    recall_at_10: receipt.scores.recall_at_10,
    ndcg_at_10: receipt.scores.ndcg_at_10,
    latency_p50_ms: receipt.scores.latency_p50_ms,
    latency_p95_ms: receipt.scores.latency_p95_ms,
    ingest_throughput_items_per_sec:
      receipt.scores.ingest_throughput_items_per_sec,
  },
  publicKeyFingerprint: receipt.signature?.publicKeyFingerprint ?? null,
}

// --------------------------------------------------------------------------
// Load or initialize the existing index
// --------------------------------------------------------------------------
type IndexEntry = typeof entry

let existing: IndexEntry[] = []
try {
  const raw = readFileSync(indexPath, 'utf-8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    process.stderr.write(
      `[update-receipts-index] ${indexPath} is not a JSON array — starting fresh.\n`,
    )
  } else {
    existing = parsed as IndexEntry[]
  }
} catch {
  // File doesn't exist yet — start fresh.
  process.stdout.write(
    `[update-receipts-index] ${indexPath} not found — creating.\n`,
  )
}

// --------------------------------------------------------------------------
// Deduplicate by receiptId, append, sort, cap at 100
// --------------------------------------------------------------------------
const withoutDupe = existing.filter((e) => e.receiptId !== entry.receiptId)
const updated = [...withoutDupe, entry]
  .sort((a, b) => new Date(b.ranAt).getTime() - new Date(a.ranAt).getTime())
  .slice(0, 100)

// --------------------------------------------------------------------------
// Write back
// --------------------------------------------------------------------------
try {
  mkdirSync(dirname(indexPath), { recursive: true })
  writeFileSync(indexPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')
} catch (err) {
  process.stderr.write(
    `[update-receipts-index] Could not write ${indexPath}: ${String(err)}\n`,
  )
  process.exit(1)
}

process.stdout.write(
  `[update-receipts-index] Index updated: ${updated.length} entries in ${indexPath}\n`,
)
