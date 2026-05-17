# przm-bench

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](package.json)
[![Methodology](https://img.shields.io/badge/methodology-przm.sh-34C468.svg)](https://przm.sh/methodology)

Reference implementation of the **[przm](https://przm.sh) benchmark
suite**. Vendor-neutral, Ed25519-signed, deterministic.

Two axes shipping today:

- **Multi-agent convergence** (`v0.1-preview`) — measures how often
  multi-agent systems collapse to a confidently-stated *wrong* answer
  when one agent is seeded with a confederate-style false position
  in round 0. Scored across 5 categories (mathematical fact,
  scientific consensus, temporal ordering, factual recall, ethical
  dilemma). Two adapters ship today: a hand-rolled `baseline` and
  `autogen` (RoundRobinGroupChat).
- **AI memory recall** — LongMemEval temporal-inference + LoCoMo,
  with seen + 20% adversarial holdout splits. Two adapters ship
  today: `engram` and `mem0`.

Every run produces a signed JSON receipt: methodology version, raw
scores, full transcripts, environment hash, fixture SHA. Receipts
are published at <https://przm.sh/receipts> and committed to this
repo under `results/published/`. Anyone can re-run. Anyone can
verify.

> **Spec is canonical at [przm.sh/methodology](https://przm.sh/methodology).**
> This repo is the reference *implementation*. When the spec changes,
> it changes there first; this repo catches up. Standards-track
> pattern (IETF, MLPerf, SPEC) — spec is the product, runner
> implements the spec.

---

## What's on the leaderboard right now

| Axis        | Adapter            | Model            | Subset    | Headline number                |
|-------------|--------------------|------------------|-----------|--------------------------------|
| convergence | `baseline`         | claude-haiku-4-5 | combined  | 93.3% correct, 96.7% collapse  |
| convergence | `baseline`         | gpt-5-mini       | combined  | 96.7% correct, 96.7% collapse  |
| convergence | `baseline`         | gpt-4o-mini      | combined  | 83.3% correct, 96.7% collapse  |
| convergence | `autogen`          | gpt-4o-mini      | combined  | 83.3% correct, **13.3% collapse** |
| convergence | `autogen`          | gpt-4o-mini      | holdout   | 66.7% correct, 0.0% collapse   |

**Notable finding**: holding gpt-4o-mini constant, AutoGen's
RoundRobinGroupChat orchestration produces a **7.3× lower collapse
rate** than the hand-rolled synchronous-round baseline on the same
30 scenarios. The framework choice is a load-bearing reliability
variable, independent of model.

Live leaderboard: <https://przm.sh/leaderboard>.
Each row links to a signed receipt at <https://przm.sh/receipts/[id]>.

---

## Quick verify

You can verify any published receipt without running the bench.

### In a browser (no install)

Open <https://przm.sh/verify>, paste a receipt JSON, click verify.
Uses SubtleCrypto + the published public key.

### From Node (TypeScript)

```typescript
import { readFileSync } from 'node:fs'
import {
  verifyReceipt,             // memory benchmark
  verifyConvergenceReceipt,  // convergence benchmark
  loadPublicKey,
} from './src/receipt/index.js'

const pub = await loadPublicKey('keys/convergence-preview.pub')
const receipt = JSON.parse(readFileSync('path/to/receipt.json', 'utf-8'))

const result = verifyConvergenceReceipt(receipt, pub)
if (result.ok) {
  console.log('✓ signature valid')
} else {
  console.error('✗', result.reason)
}
```

Returns a discriminated union; never throws. Tampering any field
(scores, transcripts, environment, fixture SHA) invalidates the
signature.

---

## Running a benchmark

### Convergence (the v0.1 wedge)

```bash
# 1. Install
pnpm install
# 2. Set provider credentials (Anthropic + Azure OpenAI today)
export ANTHROPIC_API_KEY=sk-ant-...
export AZURE_OPENAI_ENDPOINT=https://...
export AZURE_OPENAI_API_KEY=...
# 3. Run against all fixtures, all adapters
pnpm tsx scripts/run-convergence-bench.ts
# Or one adapter only:
FIXTURE_SUBSET=holdout pnpm tsx scripts/run-convergence-bench.ts --adapter autogen
```

Receipts land in `results/`. Sign them in CI (the private key never
sits on disk locally — see `scripts/gen-convergence-key.cjs` for
keypair generation if you're standing up your own instance).

### Memory (LongMemEval + LoCoMo)

```bash
pnpm onenomad-bench run --adapter engram --fixture fixtures/longmemeval/temporal-inference.json
```

`onenomad-bench` is the CLI bin; outputs an unsigned receipt JSON.
Signing happens in CI.

---

## Adapter contract

A convergence adapter is anything that implements `MultiAgentAdapter`
(see `src/types-convergence.ts`):

```typescript
export interface MultiAgentAdapter {
  name: string             // e.g. 'crewai-v0.130'
  version: string          // semver
  llmModel: string         // e.g. 'gpt-4o-mini'
  configuration: { nAgents: number; nRounds: number }

  runDebate(scenario: ConvergenceScenario): Promise<DebateTranscript>
}
```

`runDebate` is given a scenario (question, correct answer,
confederate config) and returns a transcript: every round, every
agent's answer, token counts, framework-native metadata.

Scoring is **pure** — no LLM in the grading loop. The convergence
scoring module (`src/scoring/convergence.ts`) takes a
`DebateTranscript` and computes five metrics per receipt:
`correct_final_answer_rate`, `collapse_rate`, `sycophancy_ratio`,
`tokens_per_correct_answer`, `position_flips_per_agent_per_round`.

To add a new framework adapter:

1. Implement `MultiAgentAdapter` in
   `src/adapters/multiagent/<framework>.ts`. See
   `baseline-anthropic.ts` (hand-rolled) and `autogen.ts` (Python
   subprocess wrapper) for two reference shapes.
2. Wire it into `scripts/run-convergence-bench.ts`.
3. Run it (`FIXTURE_SUBSET=seen` first to keep the holdout sealed).
4. Open a PR. Adapter fairness review is welcome — if you can argue
   our implementation handicaps your framework, send the patch.

Same pattern for memory adapters — see `src/adapters/engram.ts` for
the `Adapter` contract in `src/types.ts`.

---

## Repository layout

```
przm-bench/
├── src/
│   ├── adapters/
│   │   ├── multiagent/
│   │   │   ├── baseline-anthropic.ts    # hand-rolled synchronous baseline
│   │   │   ├── azure-openai-baseline.ts # same, swapped to Azure OpenAI
│   │   │   ├── autogen.ts               # AutoGen RoundRobinGroupChat (Python subprocess)
│   │   │   ├── autogen-runner/          # Python venv + runner script
│   │   │   └── claude-agents-sdk.ts     # Claude Agents SDK adapter (work-in-progress)
│   │   ├── engram.ts                    # memory adapter (in-process)
│   │   ├── engram-blind.ts              # blind re-implementation by independent agent
│   │   └── mem0.ts                      # memory adapter (local mode)
│   ├── receipt/
│   │   ├── canonicalize.ts              # RFC 8785 JCS
│   │   ├── sign.ts                      # memory-receipt signer
│   │   ├── sign-convergence.ts          # convergence-receipt signer
│   │   ├── verify.ts                    # memory-receipt verifier
│   │   ├── verify-convergence.ts        # convergence-receipt verifier
│   │   └── keys.ts                      # key load + SHA-256 fingerprint
│   ├── scoring/
│   │   ├── convergence.ts               # 5 deterministic convergence scoring functions
│   │   ├── recall.ts                    # recall@k
│   │   ├── ndcg.ts                      # nDCG@k
│   │   ├── latency.ts                   # p50/p95
│   │   └── aggregate.ts
│   ├── runner.ts                        # memory benchmark runner
│   ├── fixtures.ts / fixtures-convergence.ts
│   ├── cli.ts                           # `onenomad-bench` CLI (memory-bench today)
│   ├── types.ts                         # memory adapter contract
│   └── types-convergence.ts             # convergence adapter contract + Zod schemas
├── fixtures/
│   ├── longmemeval/                     # memory fixtures
│   ├── locomo/
│   ├── convergence/                     # 24 publicly visible scenarios
│   └── convergence-holdout/             # 6 sealed scenarios + deterministic split manifest
├── results/
│   └── published/                       # signed receipts (the public record)
├── keys/
│   └── convergence-preview.pub          # Ed25519 public key (private is in CI / vault)
├── scripts/
│   ├── run-convergence-bench.ts         # orchestrator
│   ├── split-holdout.cjs                # deterministic 20% holdout split (Mulberry32, seed 0x70727a6d)
│   ├── gen-convergence-key.cjs          # keypair generation (run once per benchmark)
│   ├── sync-receipts-to-web.cjs         # mirror results/ into przm-web/public/
│   └── ...
└── CHANGELOG.md
```

---

## Status

This is **v0.1 preview**. Headline finding (the 7.3× orchestration
effect) is stable across the seen and holdout splits. What's
shipping today is two adapters per axis — the surface is intentionally
narrow so the methodology can stabilize before the comparison matrix
gets wide.

On the v0.2 roadmap: CrewAI adapter, LangGraph adapter, Letta memory
adapter, Zep memory adapter. Receipts are versioned
(`benchmark: 'convergence-v0.1-preview'`) — any future schema
change ships under a new version, old receipts stay valid against
their pinned schema.

---

## Contributing

PRs welcome, especially:
- Adapter implementations for frameworks not currently represented.
- Fairness reviews of existing adapters (argue that we're
  handicapping a framework, show a patch).
- New convergence scenarios (open a PR against
  `fixtures/convergence/`; include source attribution + correct
  answer).
- Methodology challenges — the methodology page is the source of
  truth, but the path to changing it starts with an issue here.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, including
the adapter contract walkthrough, fairness obligations, and what
not to PR.

Issues + PRs at <https://github.com/OneNomad-LLC/przm-bench>.

---

## License

[Apache-2.0](LICENSE). Fixtures included. Re-use the harness, the
fixtures, the receipt format — just keep attribution.

OneNomad LLC · <https://onenomad.dev>
