/**
 * Engram adapter for @onenomad/bench.
 *
 * Wraps @onenomad/engram-mcp@^2.4.0 via its library interface (not the MCP
 * stdio server), giving the runner direct in-process access with no spawned
 * sub-process, no stdio overhead, and deterministic teardown.
 *
 * ── LOCAL-ONLY GUARANTEES ────────────────────────────────────────────────────
 *
 * STORAGE_BACKEND=file is set unconditionally at module load.  Without this,
 * engram's storage-factory waterfall routes to Pyre Cloud whenever
 * ~/.pyre/credentials.json exists (the same gotcha documented in engram's own
 * longmemeval.ts at line 29).  Setting it here — before any engram import —
 * ensures every Storage instance opened during a bench run stays on-disk in
 * the instance's private temp directory.
 *
 * No other cloud env vars (PYRE_API_URL, PYRE_API_KEY, MEM0_API_KEY) are
 * touched.  Engram's LLM extraction path (OPENROUTER_API_KEY) is not called
 * during ingest or search from the library surface; we skip KG extraction and
 * daily-entry side-effects (skipKgExtraction + skipDailyEntry) to match the
 * standalone bench code path and keep tests fast.
 *
 * ── EMBEDDING MODEL ─────────────────────────────────────────────────────────
 *
 * Engram embeds with Xenova/all-MiniLM-L6-v2 by default, downloaded once to
 * ~/.cache/huggingface (or $HF_HOME).  The first call to embed() in a cold
 * environment downloads ~22 MB.  Set ENGRAM_EMBEDDING_MODEL or
 * SMART_MEMORY_EMBEDDING_MODEL to override.  Tests will be slow on first run
 * in a fresh environment; subsequent runs are fast (model cached).
 *
 * ── ID MAPPING ──────────────────────────────────────────────────────────────
 *
 * Engram assigns its own UUIDs to stored chunks (StoredChunk.id).  We
 * maintain an internal Map<engramId, originalId> so that search results can
 * be returned with the MemoryItem.id the runner expects.  The map is wiped on
 * reset().
 *
 * ── TEMPORAL QUERIES ────────────────────────────────────────────────────────
 *
 * When opts.when is present, it is passed as referenceDate (epoch ms) to
 * engram's search() filters.  Engram uses this to anchor relative-date
 * expressions ("3 days ago") in queries against the dataset's timeline rather
 * than wall-clock now — the same mechanism used in the standalone longmemeval
 * bench (longmemeval.ts lines 306-315).
 */

// CRITICAL: force file backend before any engram import so the storage
// factory never auto-routes to Pyre Cloud, even if credentials exist.
process.env['STORAGE_BACKEND'] = 'file';

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

import {
  Storage,
  loadConfig,
  ingest,
  search,
} from '@onenomad/engram-mcp';

import type { Adapter, MemoryItem, QueryOptions, RetrievedItem } from '../types.js';

// ── Version ──────────────────────────────────────────────────────────────────

// The @onenomad/engram-mcp package.json is not exported via its "exports"
// field, so we cannot use `require('@onenomad/engram-mcp/package.json')` in
// ESM.  Instead, resolve the package root by finding the main entry point
// (`@onenomad/engram-mcp`) and walking up to the containing directory.
//
// createRequire gives us Node's CJS resolution algorithm which happily reads
// package.json even when the ESM exports map doesn't include it.
const _require = createRequire(import.meta.url);

function _readEngramVersion(): string {
  try {
    // Walk from the resolved main entry (dist/index.js) up to the
    // package root where package.json lives.
    const entryPath: string = _require.resolve('@onenomad/engram-mcp');
    // dist/index.js → package root is two levels up (dist/ → pkg root)
    const pkgRoot = dirname(dirname(entryPath));
    const raw = readFileSync(join(pkgRoot, 'package.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string') return parsed.version;
  } catch {
    // Fall through to hard-coded fallback on any resolution failure.
  }
  return '2.4.0';
}

const _engramVersion: string = _readEngramVersion();

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `bench-engram-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class EngramAdapter implements Adapter {
  readonly name = 'engram';
  readonly version: string = _engramVersion;

  private dataDir: string;
  private readonly customDataDir: string | undefined;
  private storage: Storage | null = null;

  /**
   * Map from engram's internal chunk UUID → the original MemoryItem.id we
   * were given at ingest time.  Reset on reset().
   */
  private idMap = new Map<string, string>();

  constructor(opts?: { dataDir?: string }) {
    this.customDataDir = opts?.dataDir;
    this.dataDir = opts?.dataDir ?? makeTempDir();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  private async ensureStorage(): Promise<Storage> {
    if (this.storage) return this.storage;
    const s = new Storage(this.dataDir);
    await s.ensureReady();
    this.storage = s;
    return s;
  }

  async reset(): Promise<void> {
    // Nullify the storage reference before wiping the directory — the
    // FileStorageAdapter (LanceDB) holds file handles; let GC close them
    // before rmSync tries to unlink.  We yield once to give the GC a
    // chance, then proceed.  The same pattern is used in engram's own
    // longmemeval bench (longmemeval.ts lines 388-402).
    this.storage = null;
    this.idMap.clear();

    await new Promise<void>((resolve) => setImmediate(resolve));

    try {
      rmSync(this.dataDir, { recursive: true, force: true });
    } catch {
      // On Windows, LanceDB may hold a handle briefly after the Storage
      // reference is dropped.  Leak the dir; the OS reclaims it at reboot.
    }

    this.dataDir = this.customDataDir ?? makeTempDir();
    if (this.customDataDir) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  async cleanup(): Promise<void> {
    this.storage = null;
    this.idMap.clear();

    await new Promise<void>((resolve) => setImmediate(resolve));

    try {
      rmSync(this.dataDir, { recursive: true, force: true });
    } catch {
      // Same Windows caveat as reset().
    }
  }

  // ── Ingest ────────────────────────────────────────────────────────────────

  async ingest(items: MemoryItem[]): Promise<void> {
    if (items.length === 0) return;

    const storage = await this.ensureStorage();
    const config = loadConfig({ dataDir: this.dataDir, maxRecallChunks: 500 });

    for (const item of items) {
      const chunks = await ingest(config, storage, [
        {
          content: item.content,
          type: 'context',
          origin: 'imported',
          importance: 0.5,
          // Pass the item's timestamp so engram embeds a temporal prefix
          // that the retrieval pipeline can use for temporal queries.
          createdAt: item.timestamp,
          // Skip side-effects that require an LLM and aren't needed for
          // retrieval benchmarking.
          skipKgExtraction: true,
          skipDailyEntry: true,
          // Await side-effects synchronously — we will query immediately
          // after ingesting the full fixture.
          awaitSideEffects: true,
        },
      ]);

      // Map each engram-assigned chunk ID back to the caller's item ID.
      for (const chunk of chunks) {
        this.idMap.set(chunk.id, item.id);
      }
    }
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  async query(q: string, opts: QueryOptions): Promise<RetrievedItem[]> {
    const storage = await this.ensureStorage();
    const config = loadConfig({
      dataDir: this.dataDir,
      maxRecallChunks: opts.k,
    });

    const filters: { referenceDate?: number } = {};
    if (opts.when !== undefined) {
      filters.referenceDate = opts.when.getTime();
    }

    const results = await search(
      config,
      storage,
      q,
      opts.k,
      filters,
    );

    const retrieved: RetrievedItem[] = [];

    for (const r of results.slice(0, opts.k)) {
      // Resolve to the original MemoryItem.id.  Fall back to the engram
      // chunk ID if the mapping is missing (shouldn't happen in practice,
      // but avoids a throw if engram returns a chunk we didn't ingest via
      // this adapter — e.g. a stub from source-dedup).
      const originalId = this.idMap.get(r.chunk.id) ?? r.chunk.id;

      retrieved.push({
        id: originalId,
        // Clamp to [0, 1]; engram's hybrid scorer can theoretically
        // produce values slightly above 1 on RRF fusion edge cases.
        score: Math.min(1, Math.max(0, r.score)),
        content: r.chunk.content,
      });
    }

    return retrieved;
  }
}
