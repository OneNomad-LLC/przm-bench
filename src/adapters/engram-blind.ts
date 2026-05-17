/**
 * engram-blind.ts — Blind second implementation of the Engram adapter.
 *
 * Written WITHOUT reading src/adapters/engram.ts, any existing test for it,
 * or the feat/adapter-engram branch. All design choices come from:
 *   - @onenomad/engram-mcp dist/*.d.ts (the published package's public surface)
 *   - @onenomad/engram-mcp README.md
 *   - METHODOLOGY.md and src/types.ts in this repo
 *
 * See src/adapters/BLIND_ADAPTER_NOTES.md for the full honesty disclosure.
 */

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'

import {
  Storage,
  loadConfig,
  search,
  ingest,
  flushPendingSideEffects,
  DEFAULT_CONFIG,
} from '@onenomad/engram-mcp'

import type { Adapter, MemoryItem, RetrievedItem, QueryOptions } from '../types.js'

// ---------------------------------------------------------------------------
// ID mapping strategy
//
// Engram's internal chunk IDs are UUIDs it generates. The bench scores by
// comparing retrieved IDs to the MemoryItem.id values from the fixture.
// We must map bench IDs ↔ engram chunk IDs bidirectionally.
//
// Choice: store the bench item's original ID in the chunk's `source` field.
// On retrieval, read chunk.source as the bench ID.  This avoids any custom
// metadata indirection — `source` is a first-class string field on MemoryChunk.
// ---------------------------------------------------------------------------

export class EngramBlindAdapter implements Adapter {
  readonly name = 'engram-blind'
  readonly version = '2.4.0' // @onenomad/engram-mcp version in package.json

  private dataDir: string
  private storage!: Storage

  constructor() {
    // Use a dedicated temp directory per adapter instance so the blind adapter
    // never shares state with any other adapter or with the user's ~/.claude/engram.
    this.dataDir = path.join(
      os.tmpdir(),
      `engram-blind-bench-${crypto.randomUUID()}`,
    )
  }

  // -------------------------------------------------------------------------
  // reset — wipe the LanceDB data directory and re-initialise Storage.
  // Called once per fixture, so we get a clean slate for every benchmark run.
  //
  // LanceDB embeds a Tokio async runtime in a Rust extension. After calling
  // Storage.close() we must yield the event loop briefly before removing the
  // directory, otherwise in-flight Rust background tasks (compaction, commit
  // resolution) may panic on missing manifest files. A 100ms yield is enough
  // to let the Tokio threadpool drain — verified empirically.
  // -------------------------------------------------------------------------
  async reset(): Promise<void> {
    // Close the old storage connection if one is open.
    if (this.storage) {
      try {
        // Storage.close() is synchronous per the type signature.
        this.storage.close()
      } catch {
        // Ignore — the adapter may never have been initialised.
      }
      // Yield to allow LanceDB's Tokio runtime background tasks to drain.
      await new Promise<void>((resolve) => setTimeout(resolve, 150))
    }

    // Wipe the data directory completely.
    try {
      await fs.rm(this.dataDir, { recursive: true, force: true })
    } catch {
      // Directory may not exist on first call.
    }

    await fs.mkdir(this.dataDir, { recursive: true })

    // Force file backend so we never accidentally route to Pyre Cloud if the
    // developer running the bench happens to have ~/.pyre/credentials.json.
    // (Per the README: "The benchmark forces STORAGE_BACKEND=file at module
    // load. Without it, Storage(dataDir) silently auto-routes to Pyre Cloud
    // when a credentials file exists.")
    process.env['STORAGE_BACKEND'] = 'file'

    this.storage = new Storage(this.dataDir)
    await this.storage.ensureReady()
  }

  // -------------------------------------------------------------------------
  // ingest — bulk-load fixture items into Engram's WAL.
  //
  // Key decisions:
  //   1. `createdAt` is set from MemoryItem.timestamp so temporal signals in
  //      the search pipeline see the original event time, not the ingest time.
  //      Without this, everything shares the ingest-time prefix and temporal
  //      differentiation collapses (documented in the wal.d.ts JSDoc).
  //   2. `source` carries the bench item's original ID so we can map back on
  //      retrieval (see ID mapping strategy above).
  //   3. `skipKgExtraction: true` + `skipDailyEntry: true` to match the
  //      standalone locomo bench's code path and prevent KG-extraction latency
  //      from inflating ingest wall-clock (per wal.d.ts JSDoc commentary).
  //   4. `awaitSideEffects: false` + explicit flushPendingSideEffects() after
  //      the loop — fastest perceived ingest, still fully persisted before
  //      we return, as documented in wal.d.ts.
  // -------------------------------------------------------------------------
  async ingest(items: MemoryItem[]): Promise<void> {
    await this.ensureInitialised()

    const config = loadConfig({
      dataDir: this.dataDir,
      maxRecallChunks: DEFAULT_CONFIG.maxRecallChunks,
      enableContextualPrefix: true,
    })

    await ingest(
      config,
      this.storage,
      items.map((item) => ({
        content: item.content,
        source: item.id,          // load-bearing: used as the bench ID on retrieval
        createdAt: item.timestamp, // preserves temporal ordering
        skipKgExtraction: true,
        skipDailyEntry: true,
        // awaitSideEffects defaults to true (backwards-compatible). We set it
        // explicitly to true here so that ingest() fully awaits the LanceDB
        // saveChunk writes before returning — critical for correctness in tests
        // where we immediately query after ingest. The performance tradeoff
        // (slower ingest) is acceptable for a benchmark harness.
        awaitSideEffects: true,
      })),
    )
  }

  // -------------------------------------------------------------------------
  // query — run the 9-stage hybrid search and return top-K results.
  //
  // Key decisions:
  //   1. `maxResults` is passed as `k + 5` so we have a small buffer above K
  //      in case some returned chunks don't map cleanly to a bench ID.
  //   2. `filters.referenceDate` is set from `opts.when` (Unix epoch ms) when
  //      a temporal reference date is provided. Per the search.d.ts signature,
  //      the filters object carries an optional `referenceDate?: number`.
  //   3. Scores from Engram are not guaranteed to be in [0,1]. We normalise
  //      to [0,1] by dividing by the max score in the result set, or fall back
  //      to a rank-derived score if the max is zero.
  //   4. We map back to bench IDs via chunk.source.
  // -------------------------------------------------------------------------
  async query(q: string, opts: QueryOptions): Promise<RetrievedItem[]> {
    await this.ensureInitialised()

    const config = loadConfig({
      dataDir: this.dataDir,
      maxRecallChunks: opts.k + 5,
      enableContextualPrefix: true,
    })

    const filters: {
      referenceDate?: number
    } = {}

    if (opts.when !== undefined) {
      filters.referenceDate = opts.when.getTime()
    }

    const results = await search(
      config,
      this.storage,
      q,
      opts.k + 5,
      filters,
    )

    // Normalise scores to [0,1].
    const maxScore = results.reduce((m, r) => Math.max(m, r.score), 0)
    const normFactor = maxScore > 0 ? maxScore : 1

    const retrieved: RetrievedItem[] = results
      .slice(0, opts.k)
      .map((result, i) => ({
        // chunk.source holds the original bench item ID (set at ingest time).
        id: result.chunk.source,
        score: normFactor > 0 ? result.score / normFactor : 1 - i / opts.k,
        content: result.chunk.content,
      }))

    return retrieved
  }

  // -------------------------------------------------------------------------
  // cleanup — close the LanceDB connection and remove the temp directory.
  // -------------------------------------------------------------------------
  async cleanup(): Promise<void> {
    if (this.storage) {
      try {
        this.storage.close()
      } catch {
        // Ignore
      }
    }
    try {
      await fs.rm(this.dataDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async ensureInitialised(): Promise<void> {
    if (!this.storage) {
      await this.reset()
    }
  }
}
