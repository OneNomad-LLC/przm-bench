/**
 * Mem0 adapter for @onenomad/przm-bench
 *
 * Implementation path chosen: A â€” mem0ai JS SDK in local mode (no hosted API,
 * no API key).
 *
 * How it works:
 *   - Uses `mem0ai/oss` (the open-source Memory class), NOT the hosted MemoryClient.
 *   - Vector store: MemoryVectorStore â€” in-process SQLite-backed cosine store,
 *     zero external services.
 *   - Embedder: OllamaEmbedder â€” calls a locally-running Ollama server.
 *     Default model: nomic-embed-text (384-dim). Pull it once with:
 *       ollama pull nomic-embed-text
 *   - LLM: NOT used. add() is called with infer: false, which bypasses the LLM
 *     memory-extraction pipeline entirely and stores each MemoryItem verbatim.
 *     This is intentional for benchmarking: we store what we give it, and score
 *     retrieval quality on the embedding+BM25 stack.
 *   - History store: SQLite (better-sqlite3), written to a temp file per session
 *     and deleted on cleanup.
 *
 * Prerequisites:
 *   1. Ollama installed and running: https://ollama.com
 *   2. Embedding model pulled:  ollama pull nomic-embed-text
 *      (or set MEM0_OLLAMA_MODEL env var to a different model and update
 *       MEM0_EMBED_DIMS accordingly â€” default is 768 for nomic-embed-text)
 *
 * Why not Path B (Python subprocess) or Path C (HTTP server)?
 *   The JS SDK's OSS surface is complete: MemoryVectorStore provides a
 *   fully local vector store, OllamaEmbedder provides local embeddings,
 *   and infer:false eliminates the LLM dependency. Subprocess/HTTP would
 *   add latency and operational complexity for no benefit.
 *
 * ID mapping:
 *   mem0 generates its own UUIDs for every stored memory. We pass the bench
 *   MemoryItem.id in metadata as `bench_id`. On retrieval we read
 *   result.metadata.bench_id to restore the original ID. A Map<mem0Id, benchId>
 *   is kept in memory as a fast lookup path.
 *
 * Scoping:
 *   mem0's OSS Memory.search() requires at least one of user_id/agent_id/run_id
 *   in the filter, or it throws. We use a fixed user_id of "bench" for all
 *   operations within a single Adapter instance, which correctly isolates the
 *   fixture's data from any other mem0 state on the same machine.
 */

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { Memory, MemoryVectorStore, OllamaEmbedder } from 'mem0ai/oss'
import type { Adapter, MemoryItem, QueryOptions, RetrievedItem } from '../types.js'

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BENCH_USER_ID = 'bench'

/**
 * Env overrides:
 *   MEM0_OLLAMA_BASE_URL  â€” Ollama HTTP base URL (default: http://localhost:11434)
 *   MEM0_OLLAMA_MODEL     â€” embedding model name   (default: nomic-embed-text)
 *   MEM0_EMBED_DIMS       â€” embedding dimension    (default: 768)
 */
const OLLAMA_BASE_URL = process.env['MEM0_OLLAMA_BASE_URL'] ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env['MEM0_OLLAMA_MODEL'] ?? 'nomic-embed-text'
const EMBED_DIMS = Number(process.env['MEM0_EMBED_DIMS'] ?? '768')

// â”€â”€ Mem0Adapter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class Mem0Adapter implements Adapter {
  readonly name = 'mem0'
  readonly version = '3.0.3' // mem0ai package version being benchmarked

  /** mem0 OSS Memory instance. Created fresh on first ingest/reset. */
  private mem0: Memory | null = null

  /**
   * Maps mem0-internal UUID â†’ bench MemoryItem.id.
   * Populated during ingest(); used to translate search results back.
   */
  private idMap: Map<string, string> = new Map()

  /**
   * Temp path for the mem0 SQLite history DB. Written here to keep the
   * working directory clean and to allow deterministic cleanup.
   */
  private historyDbPath: string = path.join(
    os.tmpdir(),
    `mem0-bench-history-${Date.now()}.db`,
  )

  /**
   * Temp path for the MemoryVectorStore SQLite DB.
   */
  private vectorDbPath: string = path.join(
    os.tmpdir(),
    `mem0-bench-vector-${Date.now()}.db`,
  )

  // â”€â”€ Private helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Build a fresh Memory instance wired to local-only components. */
  private buildMemory(): Memory {
    return new Memory({
      embedder: {
        provider: 'ollama',
        config: {
          // OllamaEmbedder reads url or baseURL
          url: OLLAMA_BASE_URL,
          model: OLLAMA_MODEL,
          embeddingDims: EMBED_DIMS,
        },
      },
      vectorStore: {
        provider: 'memory',
        config: {
          collectionName: 'bench',
          dimension: EMBED_DIMS,
          // dbPath puts the SQLite file in a temp location
          dbPath: this.vectorDbPath,
        },
      },
      // LLM config is provided but never invoked because every add() call
      // passes infer: false. We set an empty apiKey â€” if infer is ever
      // accidentally enabled, the OpenAI call will fail loudly rather than
      // silently doing the wrong thing.
      llm: {
        provider: 'openai',
        config: {
          apiKey: 'local-only-never-called',
          model: 'gpt-4o-mini',
        },
      },
      historyStore: {
        provider: 'sqlite',
        config: {
          historyDbPath: this.historyDbPath,
        },
      },
      disableHistory: false,
    })
  }

  /** Ensure mem0 is initialized. */
  private ensureMem0(): Memory {
    if (!this.mem0) {
      this.mem0 = this.buildMemory()
    }
    return this.mem0
  }

  /** Delete temp DB files if they exist. */
  private cleanupDbFiles(): void {
    for (const p of [this.historyDbPath, this.vectorDbPath]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p)
      } catch {
        // best-effort
      }
    }
  }

  // â”€â”€ Adapter contract â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async ingest(items: MemoryItem[]): Promise<void> {
    const mem = this.ensureMem0()
    this.idMap.clear()

    for (const item of items) {
      // infer: false â€” bypasses LLM, stores the content verbatim.
      // Bench ID travels in metadata.bench_id so we can recover it from
      // search results even without the in-memory map (for robustness).
      const result = await mem.add(
        // OSS Memory.add() accepts either a string or Message[].
        // Passing as user message (role required by internal normalizer).
        [{ role: 'user', content: item.content }],
        {
          filters: { user_id: BENCH_USER_ID },
          metadata: {
            bench_id: item.id,
            timestamp: item.timestamp,
            ...item.metadata,
          },
          infer: false,
        },
      )

      // result.results contains the newly stored memories.
      for (const stored of result.results) {
        if (stored.id) {
          this.idMap.set(stored.id, item.id)
        }
      }
    }
  }

  async query(q: string, opts: QueryOptions): Promise<RetrievedItem[]> {
    const mem = this.ensureMem0()

    const raw = await mem.search(q, {
      topK: opts.k,
      // threshold 0 returns everything that passes the semantic floor;
      // the bench runner picks top-K by score so we let mem0 do its ranking.
      threshold: 0,
      filters: { user_id: BENCH_USER_ID },
    })

    const out: RetrievedItem[] = []
    for (const r of raw.results) {
      // Resolve bench ID: prefer the in-memory map, fall back to metadata.
      const mem0Id = r.id ?? ''
      const benchId: string =
        this.idMap.get(mem0Id) ??
        (r.metadata?.['bench_id'] as string | undefined) ??
        mem0Id

      out.push({
        id: benchId,
        // mem0 OSS scoreAndRank() clamps to [0,1]
        score: Math.min(Math.max(r.score ?? 0, 0), 1),
        content: r.memory ?? '',
      })
    }
    return out
  }

  async reset(): Promise<void> {
    // Reset via mem0's own reset() which calls vectorStore.deleteCol() + db.reset()
    if (this.mem0) {
      await this.mem0.reset()
    }
    this.idMap.clear()

    // Rotate temp file paths so there's no SQLite leftover state between fixtures.
    this.cleanupDbFiles()
    this.historyDbPath = path.join(
      os.tmpdir(),
      `mem0-bench-history-${Date.now()}.db`,
    )
    this.vectorDbPath = path.join(
      os.tmpdir(),
      `mem0-bench-vector-${Date.now()}.db`,
    )

    // Rebuild mem0 with fresh paths on the next ingest/query.
    this.mem0 = null
  }

  async cleanup(): Promise<void> {
    this.mem0 = null
    this.idMap.clear()
    this.cleanupDbFiles()
  }
}
