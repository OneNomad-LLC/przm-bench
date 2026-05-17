# Onenomad Bench

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](package.json)

**Vendor-neutral, signed-receipt benchmark for AI memory servers.**

Every benchmark run produces an Ed25519-signed JSON receipt with the
full methodology, container image hash, fixture SHA, raw results, and
public verification key. Every receipt is published at
[bench.onenomad.dev](https://bench.onenomad.dev) and committed to this
repo under `results/published/`. Anyone can re-run, anyone can verify.

Tracks **Engram · Mem0 · Letta · Zep · MemPalace · HippoRAG** continuously.

---

## Why this exists

The state of AI-memory benchmarking is bad. LLM-as-judge graders that
generate-then-grade are not third-party verifications, they're vibes
with extra steps. Self-reported numbers from vendors who own the
benchmark and the harness are not falsifiable. Adversarial questions
that drop from the published subset between releases are not honest.

Onenomad Bench fixes this. Deterministic scoring (R@K, NDCG, latency
p50/p95, ingest throughput). No LLM judge anywhere in the loop. Every
run signed, every receipt public, every fixture in-repo.

The competitive landscape doesn't need another memory product. It needs
a measuring stick nobody owns.

---

## Quick verify

Verify any receipt from this repo against the public key:

```bash
npx @onenomad/bench verify results/published/<receipt-id>.json
```

Or programmatically:

```typescript
import { verifyReceipt, loadPublicKey } from '@onenomad/bench'

const pubKey = await loadPublicKey('keys/receipt-signing.pub')
const receipt = JSON.parse(readFileSync('receipt.json', 'utf-8'))
const ok = verifyReceipt(receipt, pubKey)
```

---

## Methodology

See [METHODOLOGY.md](METHODOLOGY.md). Highlights:

- **Deterministic scoring only.** No LLM in the grading loop. R@K, NDCG,
  latency, throughput.
- **Reproducible.** Run from a tagged commit, fixed container image
  hash, pinned fixture SHA. Two runs produce byte-identical receipts.
- **Vendor-neutral adapter pattern.** Each memory system has an adapter
  in `src/adapters/<name>.ts`. Adding a new one is one file.
- **Adversarial.** We re-run every competitor on every release. Public
  audit log shows every run, including the ones where Engram lost.

---

## Repository layout

```
bench/
├── src/
│   ├── adapters/            # Memory-system adapters (engram, mem0, letta, ...)
│   ├── receipt/             # Ed25519 sign/verify, JSON schema
│   ├── scoring/             # Pure scoring functions per metric
│   ├── runner.ts            # Iterates fixtures across adapters
│   ├── fixtures.ts          # JSON fixture loader + Zod validation
│   ├── cli.ts               # `onenomad-bench` command
│   └── types.ts             # Adapter contract, fixture schema, receipt schema
├── fixtures/                # Test datasets (LongMemEval temporal-inference, LoCoMo, ...)
├── results/
│   └── published/           # Committed signed receipts (the public record)
├── keys/
│   └── receipt-signing.pub  # Ed25519 public key (private key is GitHub secret)
├── web/                     # Next.js site for bench.onenomad.dev
├── .github/workflows/       # CI: run + sign + commit + deploy
├── METHODOLOGY.md
├── CHANGELOG.md
└── LICENSE                  # Apache-2.0
```

---

## License

[Apache-2.0](LICENSE). Fixtures included. Re-use the harness, the
fixtures, the receipt format — just keep attribution.

Issues + PRs at <https://github.com/OneNomad-LLC/bench>.
