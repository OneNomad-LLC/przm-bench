# Morning Brief — 2026-05-17

You said "I am going to sleep. I'll ping you in the morning. I explicitly give you full autonomy for the next 4 hours." Here is what I did with that time and what you need to decide before the next push.

---

## TL;DR

- **Wedge:** przm is now positioned as a **multi-axis AI reliability leaderboard**, not "the eval company" and not "the memory benchmark." Headline v0.1 benchmark is **multi-agent convergence + sycophancy** — measuring how fast CrewAI / AutoGen / LangGraph / Claude Agents SDK / OpenAI Swarm collapse to a confidently-stated wrong answer when one agent is confederate-injected.
- **Built:** The convergence benchmark exists in code. Scoring math is deterministic and pure-function (no LLM judge). Baseline orchestration adapter using the Anthropic Messages API is implemented and tested with a mocked client. 8 seed fixtures across 5 categories ship. Hero rewritten on przm.sh under the new positioning.
- **Shipped:** Commit `dc806c7` on `main`. Pushed at end of block; new Vercel deploy queued for przm.sh.
- **Tests:** 121 passing, 0 failing. `tsc --noEmit` clean.
- **Azure spend:** $0 this block (no Azure resources provisioned for the convergence work — local-only).
- **Your decisions:** 4 items at the bottom. Read those first if you only read one section.

---

## Why this wedge, and what got killed

I debated the wedge with three rounds of research agents per the autonomy you gave me. The full narrative is in engram under topic `wedge_decision_2026_05_17` (importance 1.0). Short version:

**Two wedges died after research:**

1. **AI-PR security audit** died because the market is fully saturated. Cursor's own Security Reviewer is FREE for Teams/Enterprise customers and went GA-beta April 2026. Snyk's MCP server, Semgrep Multimodal (March 2026), Aikido, and at least 10 other funded competitors are already in-market. YC W26 alone has Hex Security and Lexius in this space. Distribution is over; we'd be a feature in someone else's product within a quarter.

2. **Dissent-engine-as-a-product alone** died because of the 64-day clock vs. the 6-18 month practitioner-awareness lag. The problem (convergence collapse, sycophancy) is real and documented in arXiv ([2509.23055](https://arxiv.org/abs/2509.23055), [2508.14918](https://arxiv.org/abs/2508.14918)), but the buyer-side recognition that they need to pay for the fix is not there yet. By the time it is, a funded entrant outflanks us on distribution.

**The synthesis that survived:**

przm = multi-axis AI reliability leaderboard. We don't sell a product; we *publish the standard everyone is measured against*. Convergence is the headline benchmark because (a) it's the most embarrassing failure mode AI teams face right now, (b) it has no vendor-neutral measurement standard, and (c) it generates content that vendors WANT to share when they win.

Revenue model is **vendor certification** ($999-$9,999 per release), not subscriptions. Enterprise custom evaluation ($5K-$25K one-shot) Week 4+. Continuous monitoring subscription ($499-$1,999/mo) only Week 8+, after leaderboards are established.

Why a funded eval company (Patronus, Braintrust, LangSmith) won't enter: their existing SaaS customers are the same AI app builders we'd be publishing benchmarks against. They cannot credibly call out CrewAI for bad convergence when CrewAI's customers are also their customers. Brand conflict prevents them from running our play.

Full positioning lives in [`POSITION.md`](POSITION.md). Read it before anything else.

---

## What I built this block (and what I deliberately did NOT build)

### Built

| Path | What it is |
|---|---|
| `POSITION.md` | The multi-axis positioning, what przm IS NOT (eval co, memory product, SaaS), structural moat against funded incumbents, revenue model table |
| `METHODOLOGY-CONVERGENCE.md` | Full v0.1 spec — 5 scoring axes, adapter contract, fixture format, receipt-schema extension, reproducibility checklist, threats-to-validity |
| `src/types-convergence.ts` | zod-validated `ConvergenceScenario`, `DebateTranscript`, `MultiAgentAdapter`, `ConvergenceScores` |
| `src/scoring/convergence.ts` | 5 pure deterministic scoring functions — no LLM in the loop |
| `src/scoring/__tests__/convergence.test.ts` | 22 scoring tests, all green |
| `src/fixtures-convergence.ts` | Schema-validating loader + SHA-256 scenario hashing |
| `src/__tests__/fixtures-convergence.test.ts` | 7 integrity tests on the shipped fixtures (unique IDs, confederate-in-distractors invariants, etc.) |
| `fixtures/convergence/` | 8 hand-curated seed scenarios across 5 categories. Each one with a confederate config |
| `src/adapters/multiagent/baseline-anthropic.ts` | The FLOOR. Hand-rolled N-agent / R-round debate using Anthropic Messages API. Synchronous-round semantics. Confederate injected via per-agent system-prompt augmentation in round 0 only |
| `src/adapters/multiagent/__tests__/baseline-anthropic.test.ts` | 14 tests on orchestration, confederate injection, answer extraction, normalization. Uses a mocked Anthropic client — no live API calls in CI |
| `src/adapters/multiagent/claude-agents-sdk.ts` | Stub. Throws "not yet implemented." v0.2 |
| `web/src/app/page.tsx` | Hero rewritten — "AI reliability, measured." Three-card benchmark-family grid. New "For vendors" section seeding the cert revenue motion |

### Deliberately NOT built (and why)

| Thing | Why I didn't build it |
|---|---|
| A working CLI to run a real convergence bench | Requires `ANTHROPIC_API_KEY` set in env and burning live API budget. I didn't want to spend your money without an explicit number on the table — see decision item #2 |
| The full 100-150 fixture set | 8 hand-curated seeds prove the format. Scaling to 150 fixtures is a 4-6 hour job with quality review. Should I do it next, or should you hand-pick the categories first? — decision item #3 |
| The CrewAI / AutoGen / LangGraph / OpenAI Swarm framework adapters | Each is a 3-6 hour integration; total 12-24 hours. v0.2 work. v0.1 leaderboard runs the baseline only. This is honest — the baseline IS a valid data point ("no framework beats hand-rolled") |
| The receipt-schema extension for convergence variant | Spec'd in `METHODOLOGY-CONVERGENCE.md` but the implementation lives next to the runner, not the adapter. v0.1 ship |
| The 20% holdout split for convergence fixtures | Same logic as LongMemEval's holdout — once we have ≥50 fixtures total, we hold out 20%. Premature with 8 |
| Renaming the repo or any of the existing memory benchmark scaffolding | Memory benchmark is now "the second axis," not the headline. The code stays as-is; only the positioning around it changes |

---

## State of the deploy

- Commit on `main`: **`dc806c7`** — _"feat: multi-agent convergence benchmark v0.1 + przm positioning rewrite"_
- GitHub: <https://github.com/OneNomad-LLC/bench>
- Vercel project: `prj_BYobpKS6dykm20Z0VMBd6zuJjDdh` in team `team_srNNLLXW6CVOu0096eJDO7f0`
- New prod deploy: **`dpl_B37CDTYVk9AdPtjjJgHPHoiamtsG`** — _READY_, aliased to przm.sh, przm.tools, www.przm.sh, bench.przm.sh, bench.onenomad.dev.
- Confirmed live: `curl https://przm.sh/ | grep` shows "reliability", "Signed. Reproducible", "measured". The new hero IS on prod.
- Note: Vercel's GitHub-integration auto-deploy did NOT fire on the push of `dc806c7` (latest auto-deploy was the prior commit). I had to install the Vercel CLI and `vercel deploy --prod` it manually. **This is config drift worth investigating** — either the GitHub integration has lost its webhook, or the new commit's path filter excluded it (unlikely; `web/src/app/page.tsx` was changed). Not urgent, but the next time you push a web change, watch whether it auto-deploys or sits.
- npm scope `@onenomad/*` already published for `engram-mcp@2.4.0`. No new npm publishes this block.

---

## Tests + lint

```
$ npm test
ℹ tests 121
ℹ pass  121
ℹ fail  0
ℹ duration_ms ~2000

$ npm run lint   # tsc --noEmit
(clean)
```

The 22 new scoring tests cover every axis with both happy-path and edge cases (ties → null, empty rounds, no confederate scenarios, sycophancy ratio across confederate-only subset, etc.). The 14 adapter tests are paranoid about the contract: synchronous-round semantics, tool-use forcing, temperature=0, confederate-out-of-range throws, malformed tool args throw, normalization of "True" → "true". The 7 fixture-integrity tests catch the easy mistakes (duplicate IDs, confederate.assignedAnswer not in distractors, confederate answer equal to correct answer — the bench has nothing to measure if the confederate is accidentally right).

---

## Azure spend

**$0 this block.** No Azure resources touched.

The convergence benchmark, when actually RUN against the baseline adapter, will cost roughly:
- `claude-haiku-4-5` at $1/M output tokens
- ~1024 tokens/turn × 3 agents × 5 rounds × 8 scenarios × 3 median-runs = ~370K output tokens per run
- ~$0.40 per full convergence bench run on baseline adapter, with current 8-fixture set

When the fixture set scales to 150 and we run all 5 framework adapters at 3 medians each, total cost per published leaderboard refresh is ~$30. Trivial.

---

## What I need from you (decision items)

These are the four blockers between "MVP exists" and "v0.1 launchable." None of them are urgent-urgent but all four are upstream of revenue.

### 1. Run the first real bench — yes or wait?

I have the baseline adapter wired and 8 fixtures shipped. I can run a real convergence bench against `claude-haiku-4-5` for **~$0.40**. This produces the **first signed receipt of convergence data we've ever measured**, which becomes the launch artifact.

**Recommendation:** yes, run it. The marginal cost is nothing and the signed receipt becomes the "proof we ran the test" anchor for the launch narrative. If you say go, I'll spend the $0.40, write the receipt, push it.

**What you need to do:** reply "run it." That's it.

### 2. The `ANTHROPIC_API_KEY` for the baseline adapter

The baseline adapter needs an Anthropic API key. Three options:

- **(a) Use your $200/mo Claude Max key** — easiest, free at the margin. I can add it as a GitHub repo secret and call it from the convergence run workflow. Downside: ties our benchmark runs to your personal API quota.
- **(b) Provision an OneNomad org-level Anthropic API key** — proper separation, costs real $$ but trivial at the bench's spend level. Downside: 15 minutes of your time to set up.
- **(c) Use the Anthropic-via-AWS-Bedrock or Anthropic-via-Vertex path against your Azure credits** — Azure doesn't host Anthropic models so this is actually a no, but Bedrock might bill against AWS credits if you have any. Probably not worth it.

**Recommendation: (b).** OneNomad org key, billed to OneNomad LLC. Clean separation, defensible accounting, no quota collision with your Claude Max work.

### 3. Fixture scaling strategy

8 seed fixtures get us to "the format works." 100-150 fixtures across the 5 categories (20-30 per category) is what the methodology spec calls for v0.1 launch. Two strategies:

- **(a) I write all 100-150 in one autonomy block.** ~6-8 hours of agent work, possibly with cortex-research scientists you spun up doing fact verification. Estimate: cost ~$5-10 in Claude API. Done in 1-2 sessions.
- **(b) Crowdsource via PRs.** Publish a `CONTRIBUTING.md` saying "submit your favorite convergence-trap question and we'll sign-attribute you on the leaderboard." Build for free, with stronger marketing. Downside: slower, and we might not get any contributors for weeks.

**Recommendation: (a) for v0.1 launch, (b) for v0.2 expansion.** Get to launch fast on hand-curated; open contributions after the leaderboard is published and people can see what they'd be contributing to.

### 4. Launch sequencing

When the convergence benchmark is real, the launch artifacts are:

- A blog post: "We measured how fast multi-agent AI frameworks collapse to wrong answers. CrewAI [X]%, AutoGen [Y]%, LangGraph [Z]%, baseline [W]%."
- A HN submission. Title TBD.
- A Twitter/X thread + one Bluesky version.
- Direct outreach to the framework maintainers (CrewAI, AutoGen, LangGraph, Claude Agents SDK team, Swarm) offering "submit a PR to improve your adapter before we publish." This is the **respect move**, not a gotcha. It also generates relationships with the maintainers, which is the network effect.

I have a strong instinct that the launch sequencing should be: **adapters + baseline numbers in v0.1, framework numbers in v0.2 a week later, then HN/Twitter on the v0.2 drop.** That gives maintainers a week to ship improvements before we publish, which is the difference between "antagonistic benchmark" and "industry standard."

**Recommendation: launch staged.** v0.1 in 2-3 days (baseline-only leaderboard, scoring methodology published, vendor cert program live). v0.2 in 7-10 days (framework adapters land, full leaderboard goes wide). HN drop on v0.2.

---

## Stale tasks I'm leaving for you to triage

These were `pending` going into the autonomy block and stayed `pending` because they were not on the wedge path:

- #39 Steal mem0's `mem0 init --agent --json` quickstart UX (engram)
- #41 Optimize cold-start search latency 5s → <1s (engram)
- #48 Test gpt-4o-mini rerank vs gpt-4o-nano (engram)
- #56 Persona polish batch
- #44 (in_progress) Fix Storage silent cloud auto-routing — this is engram, you flagged it as a real bug before sleep

None of these are blocking the wedge. I'd rather you decide whether the wedge is right before I burn cycles on adjacent engram/persona polish.

---

## My honest assessment

I think this wedge is **defensible but not obviously a winner**. The risk is execution: a leaderboard is only authoritative if people respect the methodology, and the methodology only earns respect if early numbers are interesting AND we get framework maintainers to engage. If the first published convergence leaderboard shows all 5 frameworks within 2 percentage points of each other, the launch lands with a thud.

The mitigating factor: confederate-injection scenarios are specifically designed to **spread the field**. A framework that resists confederate pressure looks dramatically different from one that capitulates. Early experiments will tell us how wide the spread is, which is exactly what running the first real bench (decision item #1) tells us.

If the spread is wide → strong launch. If it's narrow → we need to either re-tune the confederate prompts to be more aggressive, or pivot the headline benchmark to something else from the multi-axis menu (memory recall is already strong, code-review reliability is wide open). The good news is the **positioning** survives either way; only the headline number changes.

This is the wedge I'd ship. It's not the easiest wedge, but it's the one that has both an empty commercial space AND a defensible methodology moat AND content that vendors WANT to share when they win.

---

## What's in your inbox when you wake up

Nothing literal. But: this brief, the new commit on `main`, the updated przm.sh, and the engram memory at topic `wedge_decision_2026_05_17` with the full debate trail. Your move on the four decision items.

