# Fixtures

This directory contains ground-truth fixture files for `@onenomad/przm-bench`. Every
file is validated against `FixtureSchema` from `src/types.ts`.

## How to validate

```bash
npx tsx scripts/validate-fixtures.ts
```

Exits 0 if all fixtures pass; exits 1 and prints per-field errors on failure.

---

## Available fixtures

### `longmemeval-temporal-inference-v1.json`

| Property | Value |
|----------|-------|
| Benchmark | LongMemEval |
| Subset | temporal-inference |
| Items (haystack sessions) | 50 |
| Queries | 50 |
| Version | v1 (hand-curated representative subset) |

**What it tests.** The temporal-reasoning category is LongMemEval's hardest for
retrieval systems â€” and Mem0's documented weak spot in adversarial evaluations.
It covers:

- **Date recall** â€” "When did I sign up for X?"
- **Relative-time gaps** â€” "How long between event A and event B?"
- **Before/after sequencing** â€” "What happened before I started my new job?"
- **Knowledge-update ordering** â€” "What changed about my investment allocation?"
- **Recency ranking** â€” "What was the most recent career event?"

**Temporal structure.** All sessions span 2024-01-03 to 2024-06-25. Queries
carry a `when` field anchoring the reference date (mostly 2024-06-30), matching
the `QueryOptions.when` contract in `src/types.ts` so adapters can resolve
"most recent" and relative-date queries correctly.

**Origin.** This is a hand-curated representative subset (path C). Content is
original; question/answer patterns are modelled on LongMemEval's published
category taxonomy. No data from the LongMemEval dataset itself is redistributed
here.

**Upgrade path to v0.1.** The real LongMemEval dataset contains ~133
temporal-reasoning questions. To generate a full fixture from it:

1. Download the dataset (MIT license):
   ```bash
   mkdir -p engram/benchmarks/data
   curl -fsSL \
     https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json \
     -o engram/benchmarks/data/longmemeval_s_cleaned.json
   ```
2. Run the conversion script (to be written at v0.1):
   ```bash
   npx tsx scripts/convert-longmemeval.ts \
     --input engram/benchmarks/data/longmemeval_s_cleaned.json \
     --subset temporal-reasoning \
     --output fixtures/longmemeval-temporal-inference-v1-full.json
   ```
3. Re-validate:
   ```bash
   npx tsx scripts/validate-fixtures.ts
   ```

**Source and license.** LongMemEval is published by Xiaowu Li et al. at
`https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned` under the MIT
license. The original paper: *LongMemEval: Benchmarking Chat Assistants on
Long-Term Interactive Memory* (2024). Because the source dataset is MIT-licensed,
converted fixture data from it would be redistributable â€” but confirm the current
HuggingFace dataset card before publishing a v0.1 full-conversion fixture.

---

### `longmemeval-temporal-inference-full-seen.json`

| Property | Value |
|----------|-------|
| Benchmark | LongMemEval |
| Subset | temporal-inference |
| Items (haystack sessions) | 5002 |
| Queries | 106 |
| Split | Seen (80% of 133 temporal-reasoning questions) |
| License | MIT â€” see `_license` field and `HOLDOUT_PROTOCOL.md` |

**What it tests.** Full conversion of LongMemEval's `temporal-reasoning` category
(all 133 questions, 80/20 seeded split). Each query's haystack is preserved in full
(~47 sessions per question, with non-answer sessions as distractors). Tests the
same temporal-inference dimensions as v1 but at dataset scale with real conversation
haystacks from the source dataset.

**Regenerating this fixture.** Run `npx tsx scripts/build-longmemeval-holdout.ts`
with the source dataset at `$LME_DATA_PATH` or `../engram/benchmarks/data/longmemeval_s_cleaned.json`.
See `scripts/build-longmemeval-holdout.ts` for full documentation and seed derivation.

**Holdout.** The 20% split is in `longmemeval-temporal-inference-full-holdout.json`.
See `HOLDOUT_PROTOCOL.md` for access restrictions and publication rules.

---

### `longmemeval-temporal-inference-full-holdout.json`

| Property | Value |
|----------|-------|
| Benchmark | LongMemEval |
| Subset | temporal-inference |
| Items (haystack sessions) | 1307 |
| Queries | 27 |
| Split | Holdout (20% of 133 temporal-reasoning questions) |
| License | MIT â€” see `_license` field and `HOLDOUT_PROTOCOL.md` |

**READ RESTRICTION.** Engineers and agents making Engram changes MUST NOT read
the `query` fields of this fixture. See `HOLDOUT_PROTOCOL.md` for the full policy.

This fixture exists so a published holdout score â€” run once on a tagged release â€”
can be compared against the seen score. A delta within Â±3pp on R@10 is the
credibility signal. A delta exceeding 3pp is the published finding, not noise.

---

## Adding a new fixture

1. Create `fixtures/<name>.json` conforming to `FixtureSchema` in `src/types.ts`.
2. Run `npx tsx scripts/validate-fixtures.ts` â€” must exit 0.
3. Add a row to this README.
4. Commit the fixture and README together.

Fixtures are append-only. Once a fixture ships in a tagged release it is never
edited â€” only superseded by a new file with a bumped version suffix
(e.g. `longmemeval-temporal-inference-v2.json`).
