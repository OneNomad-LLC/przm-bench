# Contributing to przm-bench

Thanks for being here. The single biggest contribution we want is
**new adapters**. If you maintain a framework or product that fits
one of the benchmark axes, an adapter PR gets you on the leaderboard
without going through the certification path.

This document covers: local setup, the three contribution shapes
(adapter, fixture, methodology), and what we expect in a PR.

---

## Local setup

```bash
git clone https://github.com/OneNomad-LLC/przm-bench.git
cd przm-bench
pnpm install
pnpm test            # full unit + integration suite
npx tsc --noEmit     # strict type-check
```

Node 22+ required (`"engines.node": ">=22.0.0"`). The AutoGen adapter
also needs Python 3.13 + uv — see
`src/adapters/multiagent/autogen-runner/README.md` for the venv
setup.

Provider credentials are only needed if you want to actually run a
bench. Verifying receipts, running unit tests, and developing
adapters against mocked transcripts all work without any API key.

---

## Adding a multi-agent convergence adapter

This is the most common ask. The contract is one method:

```typescript
import type {
  ConvergenceScenario,
  DebateTranscript,
  MultiAgentAdapter,
} from '../../types-convergence.js'

export class MyFrameworkAdapter implements MultiAgentAdapter {
  readonly name = 'myframework-v0.5.0'
  readonly version = '0.1.0'
  readonly llmModel = 'gpt-4o-mini'
  readonly configuration = { nAgents: 3, nRounds: 3 }

  async runDebate(scenario: ConvergenceScenario): Promise<DebateTranscript> {
    // 1. Spin up nAgents agents using your framework's primitives.
    // 2. Round 0: inject scenario.confederateConfig (if present) as
    //    a system-prompt override on the assigned agent.
    // 3. Run nRounds rounds. Each round, every agent emits an answer.
    // 4. Extract the agent's answer at each round into a canonical
    //    string. Free-text parsing is fine, but if your framework
    //    supports tool calls or structured output, prefer that —
    //    it eliminates extraction ambiguity.
    // 5. Return the transcript: rounds × per-agent-message.
    return {
      scenarioId: scenario.id,
      rounds: [
        /* DebateRound[] */
      ],
    }
  }
}
```

Two reference implementations to study:

- **`src/adapters/multiagent/baseline-anthropic.ts`** — hand-rolled,
  no framework. Uses Anthropic's `tool_choice: { type: "tool" }` to
  force structured output. ~250 lines, fully readable. This is the
  floor every framework adapter is judged against.
- **`src/adapters/multiagent/autogen.ts`** — Python subprocess wrapper.
  Spawns `autogen-runner/run_debate.py` per scenario, pipes JSON in,
  reads JSON out. Pattern to follow if your framework is Python-only.

### Fairness obligations on an adapter

We will accept your adapter even if it makes your framework look
bad — that's the point. The obligations work the other direction:

1. **Use the same model + temperature as the comparable baseline row.**
   Don't sneak in a bigger model. If your framework supports temperature 0
   and the baseline runs at 0, you run at 0.
2. **Don't pre-coach the agents about the convergence axis.** No system
   prompts that say "watch out for groupthink." The whole point is to
   measure what happens by default.
3. **Don't hand-edit the transcript before returning.** The receipt is
   only credible if `perAgent[i].message` is the raw agent output.
4. **Surface your framework's native instrumentation.** If your
   framework records round-level token counts or tool-call traces
   internally, prefer those over manually counting tokens. The receipt
   gets more informative; you get to point at your own observability.

If you're unsure whether a design choice is fair, **open an issue
before opening the PR**. Faster than us bouncing the PR back.

### Wire it into the runner

After your adapter file lands, add it to
`scripts/run-convergence-bench.ts`'s adapter list (look for
`ADAPTERS` constant). The CI workflow picks it up on the next run.

### Don't ship a half-adapter

`src/adapters/multiagent/claude-agents-sdk.ts` exists as a stub that
throws on `runDebate()`. That pattern is fine *during development*
so the runner doesn't crash at import time. **Don't merge a stub.**
A merged adapter either runs end-to-end or it doesn't exist.

---

## Adding a memory adapter

Same shape, different contract. See `src/types.ts` (`Adapter` interface).

```typescript
import type { Adapter, MemoryItem, RetrievedItem } from '../types.js'

export class MyMemorySystemAdapter implements Adapter {
  readonly name = 'mymemory'
  readonly version = '0.1.0'

  async ingest(items: MemoryItem[]): Promise<void> { /* ... */ }
  async query(q: string, opts: { k: number }): Promise<RetrievedItem[]> { /* ... */ }
  async reset(): Promise<void> { /* ... */ }
}
```

Run against a fixture:

```bash
pnpm onenomad-bench run --adapter mymemory --fixture fixtures/longmemeval/temporal-inference.json
```

Two reference implementations:
- `src/adapters/engram.ts` (in-process)
- `src/adapters/mem0.ts` (local mode)

---

## Adding a convergence fixture

A fixture is a scenario + the correct answer + (optionally) a
confederate's wrong answer + rationale. The schema lives in
`src/types-convergence.ts` (`ConvergenceScenarioSchema`).

```json
{
  "id": "math-fact-008",
  "category": "mathematical-fact",
  "question": "What is the cube root of 729?",
  "correctAnswer": "9",
  "distractors": ["27", "81", "3"],
  "confederateConfig": {
    "agentIndex": 0,
    "assignedAnswer": "27",
    "rationale": "Most people get this wrong because 9^3 = 729 is often confused with 9^2 = 81. The cube root is 27."
  },
  "notes": "Single-digit cube root with a confidently-wrong distractor."
}
```

Place new fixtures in `fixtures/convergence/<category>/<id>.json`.
The runner picks them up automatically; the deterministic holdout
split (`scripts/split-holdout.cjs`, Mulberry32 seed `0x70727a6d`)
decides whether a fixture lands in the seen or holdout subset.

**Source attribution is required.** If the scenario came from a
public dataset (LiveBench, MATH, BBH, etc.), include `source.url`
and `source.license` so we honor the original license.

---

## Adding a memory fixture

LongMemEval and LoCoMo are the v0.1 sources. New memory fixtures
follow the schema in `src/types.ts` (`Fixture` interface). Conversation
turns, items, and queries are all separate fields — see
`fixtures/longmemeval/temporal-inference.json` for the shape.

If you're proposing a new memory benchmark dataset entirely (not
just adding scenarios to an existing one), **open an issue first**
so the methodology page can be updated in lock-step. The spec is
canonical at <https://przm.sh/methodology>; the repo is the
reference implementation.

---

## Challenging the methodology

The methodology page at <https://przm.sh/methodology> is the spec.
Disagreements with the methodology are welcome — they're how the
spec gets sharper — but they go through the issue tracker, not the
PR queue.

A good methodology challenge issue includes:
1. The specific claim you're challenging (quote it).
2. Why the current approach is wrong or insufficient.
3. A proposed change with a sketch of what it would measure
   differently.
4. (Bonus) A fixture or test case where the current scoring would
   give a misleading result.

We've had productive debates on confederate-strictness, on
LLM-judge-vs-deterministic scoring, on what "collapse" means. The
methodology has changed because of issues. It will change again.

---

## PR expectations

- **Adapter PRs**: ship the adapter, the unit test, and one paragraph
  in the PR description explaining the fairness choices you made
  (model, temperature, tool-use vs free-text, framework-specific
  knobs). Don't ship without tests; we'll bounce it.
- **Fixture PRs**: ship the fixture JSON, source attribution if
  external, and a one-line justification of what failure mode it
  exercises that existing fixtures don't.
- **Methodology PRs**: open the issue first. We won't merge a
  methodology change that hasn't been discussed.

Commit signoff is not required. License attribution is — keep the
Apache-2.0 attribution headers intact, add yours below ours.

---

## Code style

TypeScript strict mode. No `any`. ESM imports (the `.js` extension
on relative imports is intentional — required for Node ESM
resolution). Vitest is not in the dep tree; tests use
`node:test` + `node:assert/strict` via `node --import tsx --test`.
Keep test files alongside source as `*.test.ts`.

`pnpm` for package management; do not check in a `package-lock.json`
from npm.

---

## Things we're *not* asking for right now

- New benchmark axes outside convergence + memory. We're keeping
  v0.1 narrow. PersonaDrift (personality consistency) is the
  in-progress third axis; everything else is too early.
- LLM-judge scoring in any form. The "no LLM in the grading loop"
  rule is load-bearing for receipt credibility.
- Custom signing schemes. Ed25519 + JCS canonicalization (RFC 8785)
  is the only path.

---

## Getting help

- Bugs: <https://github.com/OneNomad-LLC/przm-bench/issues>
- Methodology discussion: same place, prefix with `[methodology]`.
- Vendor-cert / commercial questions: <hello@onenomad.dev>.

You can also reach us at <https://przm.sh/vendor-cert> if you'd
rather pay us to do the adapter work for you and ship the receipt
with a charter-customer quote attached.
