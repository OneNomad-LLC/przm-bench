# przm — what we are and what we're not

## What we are

A multi-axis **AI reliability leaderboard**. We publish category-defining,
vendor-neutral, OSS benchmark standards in domains where AI failure
modes are real and unmeasured.

Every benchmark we publish is:
- **Signed.** Every result is an Ed25519-signed receipt. Tampering is
  cryptographically detectable. Public verification key in this repo.
- **Deterministic.** No LLM judges anywhere in the scoring loop. Scoring
  is pure-function math on system state. Two runs of the same fixture
  produce byte-identical scores.
- **Reproducible.** Container image hashes, fixture SHA-256, model
  versions all pinned in the receipt. Anyone can re-run.
- **Adversarially constructed.** Holdout subsets are reserved from
  anyone vendor-side. Blind re-implementations are published alongside
  primary adapters. Fixtures are designed to break things, not to
  flatter them.

## What we are not

- **Not an LLM eval company.** Patronus, Braintrust, LangSmith, and
  Helicone are eval companies — they sell "measure your LLM" SaaS.
  That category is crowded with funded incumbents. We don't compete
  there.
- **Not a memory product company.** Mem0, Letta, Zep, MemPalace,
  HippoRAG sell memory primitives to AI engineers. Crowded with
  funded incumbents. We don't compete there.
- **Not an observability product.** Langfuse, Arize, Pydantic Logfire,
  Inkeep, Braintrust trace-and-graph LLM calls. Different problem.
- **Not a SaaS subscription business.** Subscriptions need retention,
  retention needs habit, habit needs 90+ days. Our revenue shape is
  vendor certification + custom evaluation, not seat licenses.

The distinction matters. We are the **graders**, not the graded. We
publish the OSS standards everyone else is measured against. The
methodology is the moat.

## What we publish

Multi-axis means: each benchmark targets a different category of AI
failure mode that doesn't have a vendor-neutral standard yet.

- **Multi-agent convergence** (headline benchmark, v0.1) —
  measures how fast a multi-agent debate collapses to a single answer
  when one agent is confederate-injected with a confidently-stated
  wrong answer. Tests CrewAI, AutoGen, LangGraph, Claude Agents SDK,
  OpenAI Swarm.
- **AI memory recall** — extends the existing engram-led work
  (LongMemEval temporal-inference + LoCoMo). Both seen and 20% holdout
  fixtures published, with blind-adapter re-implementations.
- **AI code review reliability** (week 2-3) — turns the saturated
  Snyk / Semgrep / Cursor / CodeRabbit market against itself. Score
  each on actual hit rate, false-positive rate, missed-vuln rate.
- **Future axes** as they become defensibly buildable. Sycophancy
  drift over conversation length. Provenance accuracy on
  citation-required tasks. Hallucinated-API generation rate in code
  scaffolding.

## How we make money

| Mechanism | Price | Buyer | When |
|---|---|---|---|
| **Vendor certification** | $999 - $9,999 per release | Framework / product vendors who want a signed receipt of their performance to use in their own marketing | Day 1 of each benchmark's public launch |
| **Custom enterprise evaluation** | $5,000 - $25,000 one-shot | Enterprise teams picking between vendors who need a private benchmark on their use case | Week 4+ |
| **Continuous monitoring subscription** | $499 - $1,999/month | Teams that want their vendor stack continuously re-benchmarked as competitors ship | Week 8+, only after leaderboards are established |

We do not sell the benchmark harness. We do not sell access to fixtures.
The OSS stays free. Money comes from being the authoritative third
party that ran the test.

## The structural moat

A funded eval company can build everything we have in a sprint. They
will not, because:

- **Brand conflict.** Patronus/Braintrust/LangSmith sell to AI app
  builders. They can't credibly publish "this AI framework's agents
  agree with each other" content because that audience is who they
  sell to.
- **Distribution model conflict.** Their unit economics require
  customer data flowing through their SaaS. Ours don't. Their
  certification offering would compete with their main SKU; ours
  doesn't compete with anything else they sell because they don't sell
  it.
- **Methodology priority.** First-mover on a specific benchmark
  standard owns the citation chain. Late entrants compete in our
  category as "we also score 87% on przm-bench."

A funded memory company (Mem0, Letta) won't enter because publishing
benchmarks they don't dominate is brand-suicidal for them.

The defensible position is the one no incumbent can credibly take.

## License

Apache-2.0 across all benchmarks, fixtures, harnesses, and adapters.
The standards are public goods. The money comes from running them
authoritatively on contract.
