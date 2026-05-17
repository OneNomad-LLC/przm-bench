# Blind Adapter Notes — engram-blind.ts

## Public sources consulted

1. `node_modules/@onenomad/engram-mcp/README.md` — architecture, tools table,
   env vars, storage backends, benchmark methodology notes, `buildContextPrefix()`
   documentation in the "benchmark notes" callouts.
2. `node_modules/@onenomad/engram-mcp/dist/index.d.ts` — the full public export
   surface. Identified `Storage`, `loadConfig`, `search`, `ingest`,
   `flushPendingSideEffects`, `DEFAULT_CONFIG` as the relevant exports.
3. `node_modules/@onenomad/engram-mcp/dist/storage.d.ts` — `Storage` class shape,
   `ensureReady()`, `close()`.
4. `node_modules/@onenomad/engram-mcp/dist/wal.d.ts` — `IngestEntry` interface in
   full, including `createdAt`, `skipKgExtraction`, `skipDailyEntry`,
   `awaitSideEffects`, and the JSDoc explaining why each matters for benchmarks.
5. `node_modules/@onenomad/engram-mcp/dist/search.d.ts` — `search()` signature,
   specifically the `filters` parameter with `referenceDate?: number`.
6. `node_modules/@onenomad/engram-mcp/dist/types.d.ts` — `SmartMemoryConfig`,
   `SearchResult`, `MemoryChunk`, `DEFAULT_CONFIG`.
7. `node_modules/@onenomad/engram-mcp/dist/storage-factory.d.ts` — `STORAGE_BACKEND`
   resolution waterfall (the three-tier env-var / credentials-file / file default).
8. `src/types.ts` in this repo — `Adapter`, `MemoryItem`, `RetrievedItem`,
   `QueryOptions` (the bench contract).
9. `METHODOLOGY.md` and `README.md` in this repo — scoring functions, fixture
   schema, the adapter pattern description.
10. `node_modules/@onenomad/engram-mcp/package.json` — version `2.4.0` (used for
    `adapter.version`).

No other files were read. In particular:
- `src/adapters/engram.ts` was NOT read.
- `src/adapters/__tests__/engram.test.ts` was NOT read.
- No file under `.claude/worktrees/agent-*/src/adapters/` was read.
- The `feat/adapter-engram` remote branch was NOT checked out or examined.

## Implementation choices

**Storage backend:** `file` (LanceDB + filesystem). Forced via
`process.env['STORAGE_BACKEND'] = 'file'` before constructing `Storage`. The
README's benchmark notes section warned explicitly that omitting this causes
`Storage(dataDir)` to silently route to Pyre Cloud if `~/.pyre/credentials.json`
exists, poisoning isolation. This is the obvious safe choice.

**Data directory:** A fresh `os.tmpdir()` subdirectory per adapter instance, with
a UUID suffix. `reset()` wipes and recreates it. `cleanup()` removes it. This
gives per-fixture isolation without side-effecting the user's `~/.claude/engram`.

**ID mapping strategy:** Store the bench item's original `id` in
`IngestEntry.source`. On retrieval, read `result.chunk.source` as the bench ID.
Rationale: `source` is a first-class `string` field on `MemoryChunk` (visible in
`types.d.ts`), it doesn't go through any serialisation transform, and it is
included in `StoredChunk` returned by `search()`. No secondary lookup table
needed.

**Temporal parameter name:** `filters.referenceDate` (type `number`, Unix epoch
ms). Taken directly from the `search()` signature in `search.d.ts`. The value is
`opts.when.getTime()`. The README's Stage 6 description confirms this is the
time-window retrieval hook: "When the system detects temporal signals, it pulls
memories from the relevant time period into the candidate pool."

**`createdAt` override at ingest:** Set from `MemoryItem.timestamp`. The `wal.d.ts`
JSDoc is explicit: "Without an override, every ingested memory shares the
ingest-time prefix … losing all temporal differentiation." This is load-bearing
for temporal benchmarks.

**Side-effect flags:** `skipKgExtraction: true`, `skipDailyEntry: true`,
`awaitSideEffects: false` + `flushPendingSideEffects()` after the ingest loop.
The `wal.d.ts` JSDoc explains this matches the standalone locomo bench's code
path and avoids inflating ingest wall-clock with KG extraction work.

**Score normalisation:** Engram's `search()` returns raw scores whose range is
not bounded to [0,1] in the type definition. The bench's `RetrievedItem.score`
must be in [0,1]. We divide by the max score in the result set, or fall back to
a rank-derived score if max is zero.

## Leak disclosure

I saw the following that could be considered partial information leaks:

1. **`ls src/`** — returned the string `adapters` in the directory listing,
   confirming that a directory called `adapters` exists. This matches the README's
   layout (`src/adapters/`), so it is not a new signal. I did not list the
   directory's *contents*.

2. **`git branch -a`** — showed `remotes/origin/feat/adapter-engram` exists. This
   confirms the primary adapter branch was pushed. I did not check it out or
   inspect any file on it.

3. **Glob for `package.json`** — the Glob pattern matched files in multiple
   worktrees including `agent-aea69274a180f945f`. This is how I found which
   worktree had `@onenomad/engram-mcp` installed. I read only the README and
   `.d.ts` files from that worktree's `node_modules/@onenomad/engram-mcp/`, which
   are the published npm package's files — allowed by the task spec. I did NOT
   read any `.ts` source files from that worktree.

None of these leaks influenced a design decision that wasn't already forced by
the public API surface.

## Predictions: where will numbers differ from the primary?

**Most likely to agree:** core semantic recall on non-temporal queries. Both
adapters must call the same `search()` function with the same query string;
differences in score can only come from config overrides or the number of
candidates passed to `search()`. With `enableContextualPrefix: true` and the
same `createdAt` override strategy, results should be nearly identical.

**Most likely to diverge:**

1. **Score normalisation.** If the primary adapter normalises differently (e.g.
   returning raw Engram scores, or using a different denominator), NDCG@10
   numbers will diverge even if the rank order is identical. This is a
   methodological choice with no "correct" answer visible from the public API.

2. **Candidate pool size.** I pass `opts.k + 5` as the `maxResults` argument to
   `search()`. If the primary passes a larger or smaller buffer (e.g. `opts.k *
   2` or just `opts.k`), borderline hits near rank K may flip in or out. This
   would show as small R@10 variance on hard queries.

3. **`skipKgExtraction` flag.** If the primary does NOT set this flag (letting KG
   extraction run), the ingested chunks will have richer graph edges, potentially
   improving spreading activation (Stage 8) at the cost of slower ingest. This
   would show as a small R@10 improvement in the primary at the cost of much
   slower ingest throughput — visible in the `ingest_throughput_items_per_sec`
   metric.

Expected divergence direction: if the primary enables KG extraction, its recall
will be slightly higher. Otherwise, numbers should agree within ±1pp on R@10.
Random noise from LanceDB's ANN approximate search is unlikely to account for
more than ±0.5pp across full fixtures.
