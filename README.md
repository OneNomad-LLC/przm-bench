# przm-bench

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](package.json)

**Reference implementation of the [przm](https://przm.sh) benchmark
suite.** Vendor-neutral, Ed25519-signed, deterministic.

Tracks the AI failure modes that don't have standards yet:

- **Multi-agent convergence** — how fast CrewAI / AutoGen / LangGraph /
  Claude Agents SDK / OpenAI Swarm collapse to a confidently-stated
  wrong answer when one agent is confederate-injected.
- **AI memory recall** — Engram · Mem0 · Letta · Zep · MemPalace ·
  HippoRAG on LongMemEval temporal-inference and LoCoMo, with seen +
  20% holdout splits.

Every benchmark run produces a signed JSON receipt with the full
methodology, container image hash, fixture SHA, raw results, and
public verification key. Every receipt is published at
[przm.sh](https://przm.sh) and committed to this repo under
`results/published/`. Anyone can re-run, anyone can verify.

---

## Methodology

The canonical methodology specs live at
**<https://przm.sh/methodology>**.

This repo is the *reference implementation* of those specs. When the
spec changes, it changes at `przm.sh` first; this repo catches up.
That's the standards-track pattern (IETF, MLPerf, SPEC) — the spec is
the product, the runner implements the spec.

Spec markdown lives in
[OneNomad-LLC/przm-web/content](https://github.com/OneNomad-LLC/przm-web/tree/main/content).

---

## Quick verify

Verify any receipt from this repo against the public key:

```bash
npx @onenomad/przm-bench verify results/published/<receipt-id>.json
```

Or programmatically:

```typescript
import { verifyReceipt, loadPublicKey } from '@onenomad/przm-bench'

const pubKey = await loadPublicKey('keys/receipt-signing.pub')
const receipt = JSON.parse(readFileSync('receipt.json', 'utf-8'))
const ok = verifyReceipt(receipt, pubKey)
```

---

## Repository layout

```
przm-bench/
├── src/
│   ├── adapters/
│   │   ├── multiagent/      # Convergence adapters (baseline, CrewAI, AutoGen, ...)
│   │   ├── engram.ts        # Memory adapter
│   │   ├── mem0.ts          # Memory adapter
│   │   └── ...
│   ├── receipt/             # Ed25519 sign/verify, JSON schema
│   ├── scoring/             # Pure scoring functions per metric
│   ├── runner.ts            # Iterates fixtures across adapters
│   ├── fixtures.ts          # Memory-benchmark fixture loader
│   ├── fixtures-convergence.ts # Convergence-benchmark fixture loader
│   ├── cli.ts               # `przm-bench` command
│   ├── types.ts             # Memory adapter contract + receipt schema
│   └── types-convergence.ts # MultiAgentAdapter + DebateTranscript
├── fixtures/
│   ├── longmemeval/         # Memory benchmark fixtures
│   ├── locomo/              # Memory benchmark fixtures
│   └── convergence/         # Convergence scenarios across 5 categories
├── results/
│   └── published/           # Committed signed receipts (the public record)
├── keys/
│   └── receipt-signing.pub  # Ed25519 public key (private key is GitHub secret)
├── .github/workflows/       # CI: run + sign + commit + deploy
├── CHANGELOG.md
└── LICENSE                  # Apache-2.0
```

---

## License

[Apache-2.0](LICENSE). Fixtures included. Re-use the harness, the
fixtures, the receipt format — just keep attribution.

Issues + PRs at <https://github.com/OneNomad-LLC/przm-bench>.
