# Onenomad Bench Methodology

This document specifies how Onenomad Bench scores a memory system and
how a receipt is produced. Everything here is intentionally precise so
a result can be independently audited or reproduced.

## Core principles

- **Deterministic scoring only.** Two runs of the same fixture against
  the same adapter version produce byte-identical results modulo the
  timestamp + signature fields. No LLM in the grading loop.
- **Reproducible.** Run from a tagged commit; container image hash and
  fixture SHA pinned in the receipt; node version + adapter version
  pinned.
- **Signed.** Every receipt is signed with Ed25519. The public key is
  in the repo at `keys/receipt-signing.pub`. The private key is only
  ever in a GitHub Actions secret; it never enters source, agent
  context, or any other surface.
- **Public audit log.** Every receipt is committed to
  `results/published/`. Once committed, never edited — only superseded
  by a new receipt with a new ID.

## The adapter contract

```typescript
interface Adapter {
  readonly name: string         // "engram", "mem0", "letta", ...
  readonly version: string      // SemVer of the system being benched

  ingest(items: Array<MemoryItem>): Promise<void>
  query(q: string, opts: { k: number, when?: Date }): Promise<RetrievedItem[]>
  reset(): Promise<void>        // Wipe state for a fresh fixture
}

interface MemoryItem {
  id: string
  content: string
  metadata: Record<string, unknown>
  timestamp: string             // ISO8601
}

interface RetrievedItem {
  id: string
  score: number                 // [0,1] confidence per the adapter
  content: string               // For human verification
}
```

The adapter author is responsible for translating their system's
internal vocabulary to this surface. We do not score "did the adapter
get the right idea." We score "for query Q, did the top-K returned IDs
include the expected_answer_ids."

## The receipt schema (v0.0.1)

```json
{
  "receiptId": "uuid-v4",
  "benchVersion": "0.0.1",
  "ranAt": "2026-05-17T15:23:01Z",
  "adapter": { "name": "engram", "version": "2.4.0" },
  "fixture": {
    "id": "longmemeval-temporal-inference-001",
    "sha256": "abcd...",
    "n": 500
  },
  "environment": {
    "node": "22.11.0",
    "platform": "linux/amd64",
    "containerImage": "ghcr.io/onenomad-llc/bench-runner:<sha>",
    "git": { "commit": "<sha>", "dirty": false }
  },
  "scores": {
    "recall_at_5": 0.972,
    "recall_at_10": 0.988,
    "ndcg_at_10": 0.951,
    "latency_p50_ms": 44,
    "latency_p95_ms": 187,
    "ingest_throughput_items_per_sec": 312
  },
  "perQuery": [
    { "queryId": "q-001", "retrieved": ["id-13","id-42",...], "hit": true, "rank": 2 }
  ],
  "signature": {
    "algorithm": "Ed25519",
    "publicKeyFingerprint": "sha256:abcd...",
    "value": "base64url(...)"
  }
}
```

The `signature.value` is computed over a canonicalized JSON
representation of the receipt with the signature field omitted.
Canonicalization: sorted keys, no whitespace, no trailing comma. Uses
JCS (RFC 8785) implementation in `src/receipt/canonicalize.ts`.

## Scoring functions

All implemented as pure functions in `src/scoring/`.

- **`recallAtK(retrieved, expected, k)`**: fraction of fixtures where
  any of `expected` appears in `retrieved.slice(0, k)`. Note: empty
  `expected` arrays are excluded from the denominator (the engram-known
  inflation bug — see `tests/scoring.test.ts`).
- **`ndcgAtK(retrieved, expected, k)`**: normalized DCG at K. Standard
  formulation.
- **`latencyP50`, `latencyP95`**: percentiles of per-query wall-clock
  time, milliseconds.
- **`ingestThroughput`**: items ingested per second across the full
  fixture, single-threaded.

## Reproducibility checklist

A receipt is considered defensible if:

1. The `environment.git.commit` is a tagged release of `bench`.
2. The `environment.git.dirty` is `false`.
3. The container image hash matches a tagged image at
   `ghcr.io/onenomad-llc/bench-runner`.
4. The `fixture.sha256` matches the fixture content at that commit.
5. The signature verifies against `keys/receipt-signing.pub`.
6. Re-running the same adapter version + fixture + environment
   produces byte-identical `scores` (modulo timestamp).

## Threats to validity

- **Adapter authorship is judgment.** An adapter author can write
  pessimal code for a competitor and optimal code for their own
  system. Mitigation: PR-based, public-reviewed adapters; competitors
  can submit corrections.
- **Fixture selection bias.** We pick fixtures; we don't generate
  them. Adversarial fixtures are welcomed via PR.
- **Latency varies with hardware.** Receipts pin the container hash but
  the underlying GitHub Actions runner type can change. Receipts
  capture the runner OS + arch + reported CPU.
- **Signing-key compromise.** If the private key leaks, all receipts
  signed after the leak are suspect. Mitigation: key rotation procedure
  documented in `keys/ROTATION.md` (to be written before v0.1.0
  publish); new public key shipped with explicit cutover commit.

## Versioning

Breaking changes to the receipt schema, scoring math, or adapter
contract bump the major version. New scoring metrics, new adapters,
new fixtures bump the minor. Bug fixes bump the patch. Published
receipts pin both the bench version and the adapter version.

## License

Apache-2.0. Methodology is in-repo and forkable; if you build a
competing benchmark with a different methodology, please name it
differently.
