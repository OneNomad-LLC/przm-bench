# przm-bench

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](package.json)
[![Methodology](https://img.shields.io/badge/methodology-przm.sh-34C468.svg)](https://przm.sh/methodology)

Reference implementation of the **[przm](https://przm.sh) benchmark suite**. Vendor-neutral, Ed25519-signed, deterministic.

Two axes in v0.1:

- **Multi-agent convergence** (`v0.1-preview`): twelve signed receipts on the leaderboard (six adapter configurations × combined-30 + 6-fixture holdout). Measures how often multi-agent systems collapse to a confidently-stated *wrong* answer when one agent is seeded with a confederate-style false position in round 0. Scored across 5 categories (factual-math, code-correctness, factual-history, temporal-ordering, boolean-trap). Six adapter configurations ship today: hand-rolled `baseline` (sync + sequential variants on Claude Haiku 4.5, sync + sequential on gpt-4o-mini, sync on gpt-5-mini) plus `autogen` (RoundRobinGroupChat on gpt-4o-mini).
- **AI memory recall**: methodology spec + harness + two adapters (`engram`, `mem0`) shipped. Signed receipts publish on the v0.2 cycle. The v0.1 surface is the spec + the open-source runner so memory-system maintainers can review the methodology before we publish numbers against it.

Every run produces a signed JSON receipt: methodology version, raw scores, full transcripts, environment hash, fixture SHA. Receipts are published at <https://przm.sh/receipts> and committed to this repo under `results/published/`. Anyone can re-run. Anyone can verify.

> **Spec is canonical at [przm.sh/methodology](https://przm.sh/methodology).** This repo is the reference *implementation*. When the spec changes, it changes there first; this repo catches up. Standards-track pattern (IETF, MLPerf, SPEC): spec is the product, runner implements the spec.

---

## What's on the leaderboard right now

Combined 30-fixture run:

| Axis        | Adapter                       | Model            | correct | collapse |
|-------------|-------------------------------|------------------|---------|----------|
| convergence | `baseline` (sync)             | claude-haiku-4-5 | 96.7%   | 56.7%    |
| convergence | `baseline` (sequential)       | claude-haiku-4-5 | 93.3%   | 53.3%    |
| convergence | `baseline` (sync)             | gpt-5-mini       | 96.7%   | 100.0%   |
| convergence | `baseline` (sync)             | gpt-4o-mini      | 90.0%   | 90.0%    |
| convergence | `baseline` (sequential)       | gpt-4o-mini      | 83.3%   | 83.3%    |
| convergence | `autogen` RoundRobinGroupChat | gpt-4o-mini      | 83.3%   | **20.0%**|

Sealed 6-fixture holdout:

| Axis        | Adapter                       | Model            | correct | collapse |
|-------------|-------------------------------|------------------|---------|----------|
| convergence | `baseline` (sync)             | claude-haiku-4-5 | 100.0%  | 66.7%    |
| convergence | `baseline` (sequential)       | claude-haiku-4-5 | 83.3%   | 66.7%    |
| convergence | `baseline` (sync)             | gpt-5-mini       | 100.0%  | 100.0%   |
| convergence | `baseline` (sync)             | gpt-4o-mini      | 66.7%   | 83.3%    |
| convergence | `baseline` (sequential)       | gpt-4o-mini      | 66.7%   | 66.7%    |
| convergence | `autogen` RoundRobinGroupChat | gpt-4o-mini      | 83.3%   | **0.0%** |

**Notable finding**: holding gpt-4o-mini constant, AutoGen's RoundRobinGroupChat collapsed on **0 of 6 sealed holdout scenarios** while the hand-rolled baseline collapsed on 5 of 6. The gap survives a reveal-protocol control: the sequential-reveal baseline (which matches AutoGen's in-round visibility pattern) still collapses 4 of 6 on the same fixtures. The framework choice is a load-bearing reliability variable, independent of both model and reveal protocol.

Live leaderboard: <https://przm.sh/leaderboard>. Each row links to a signed receipt at <https://przm.sh/receipts/[id]>.

---

## Quick verify

You can verify any published receipt without running the bench.

### In a browser (no install)

Open <https://przm.sh/verify>, paste a receipt JSON, click verify. Uses SubtleCrypto plus the published public key.

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

Returns a discriminated union; never throws. Tampering any field (scores, transcripts, environment, fixture SHA) invalidates the signature.

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

Receipts land in `results/`. Sign them in CI (the private key never sits on disk locally; see `scripts/gen-convergence-key.cjs` for keypair generation if you're standing up your own instance).

### Memory (LongMemEval temporal-inference subset)

```bash
pnpm przm-bench run --adapter engram --fixture fixtures/longmemeval-temporal-inference-v1.json
```

LoCoMo and the other LongMemEval categories are v0.2 work. v0.1 ships
only the temporal-inference subset.

`przm-bench` is the CLI bin; outputs an unsigned receipt JSON. Signing happens in CI.

---

## Adapter contract

A convergence adapter is anything that implements `MultiAgentAdapter` (see `src/types-convergence.ts`):

```typescript
export interface MultiAgentAdapter {
  name: string             // e.g. 'crewai-v0.130'
  version: string          // semver
  llmModel: string         // e.g. 'gpt-4o-mini'
  configuration: { nAgents: number; nRounds: number }

  runDebate(scenario: ConvergenceScenario): Promise<DebateTranscript>
}
```

`runDebate` is given a scenario (question, correct answer, confederate config) and returns a transcript: every round, every agent's answer, token counts, framework-native metadata.

Scoring is **pure**. No LLM in the grading loop. The convergence scoring module (`src/scoring/convergence.ts`) takes a `DebateTranscript` and computes five metrics per receipt: `correct_final_answer_rate`, `collapse_rate`, `sycophancy_ratio`, `tokens_per_correct_answer`, `position_flips_per_agent_per_round`.

To add a new framework adapter:

1. Implement `MultiAgentAdapter` in `src/adapters/multiagent/<framework>.ts`. See `baseline-anthropic.ts` (hand-rolled) and `autogen.ts` (Python subprocess wrapper) for two reference shapes.
2. Wire it into `scripts/run-convergence-bench.ts`.
3. Run it (`FIXTURE_SUBSET=seen` first to keep the holdout sealed).
4. Open a PR. Adapter fairness review is welcome. If you can argue our implementation handicaps your framework, send the patch.

Same pattern for memory adapters: see `src/adapters/engram.ts` for the `Adapter` contract in `src/types.ts`.

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
│   ├── cli.ts                           # `przm-bench` CLI (memory-bench today)
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

This is **v0.1 preview**. The headline finding (AutoGen's 0/6 vs baseline's 5/6 holdout collapse on gpt-4o-mini) is stable across the seen and holdout splits and survives a reveal-protocol control. What's shipping today is six adapter configurations on the convergence axis and a memory-recall harness with `engram` + `mem0` adapters. The surface is intentionally narrow so the methodology can stabilize before the comparison matrix gets wide.

On the v0.2 roadmap: CrewAI adapter, LangGraph adapter, Letta memory adapter, Zep memory adapter, age/SOPS-encrypted holdout fixtures, multi-run aggregation for frameworks without a `seed` knob. Receipts are versioned (`benchmark: 'convergence-v0.1-preview'`); any future schema change ships under a new version, and old receipts stay valid against their pinned schema.

---

## Contributing

PRs welcome, especially:
- Adapter implementations for frameworks not currently represented.
- Fairness reviews of existing adapters (argue that we're handicapping a framework, show a patch).
- New convergence scenarios (open a PR against `fixtures/convergence/`; include source attribution and correct answer).
- Methodology challenges. The methodology page is the source of truth, but the path to changing it starts with an issue here.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, including the adapter contract walkthrough, fairness obligations, and what not to PR.

Issues and PRs at <https://github.com/OneNomad-LLC/przm-bench>.

---

## License

[Apache-2.0](LICENSE). Fixtures included. Re-use the harness, the fixtures, the receipt format. Just keep attribution.

OneNomad LLC. <https://onenomad.dev>
