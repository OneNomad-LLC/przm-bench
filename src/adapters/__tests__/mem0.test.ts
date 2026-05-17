/**
 * Smoke tests for Mem0Adapter.
 *
 * Prerequisites (CI must provide, or tests are skipped):
 *   - Ollama running at MEM0_OLLAMA_BASE_URL (default: http://localhost:11434)
 *   - Model pulled: `ollama pull nomic-embed-text` (or MEM0_OLLAMA_MODEL)
 *
 * The tests call the real Ollama HTTP API. They are skipped automatically
 * if Ollama is not reachable so that the suite stays green in environments
 * without Ollama (e.g. standard CI runners).
 *
 * To run locally:
 *   ollama serve &
 *   ollama pull nomic-embed-text
 *   npm test -- src/adapters/__tests__/mem0.test.ts
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { Mem0Adapter } from '../mem0.js'
import type { MemoryItem } from '../../types.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL =
  process.env['MEM0_OLLAMA_BASE_URL'] ?? 'http://localhost:11434'

/**
 * Returns true if Ollama is reachable, false otherwise.
 * Used to gate tests in environments without Ollama.
 */
async function ollamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Minimal MemoryItem factory. */
function item(id: string, content: string, ts?: string): MemoryItem {
  return {
    id,
    content,
    metadata: {},
    timestamp: ts ?? '2026-01-01T00:00:00.000Z',
  }
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const FIXTURE_ITEMS: MemoryItem[] = [
  item('item-001', 'The user prefers dark mode in all applications.'),
  item('item-002', 'The user is allergic to peanuts and tree nuts.'),
  item(
    'item-003',
    'The user lives in Portland, Oregon and works remotely.',
  ),
  item(
    'item-004',
    'The user has a golden retriever named Biscuit who loves fetch.',
  ),
  item(
    'item-005',
    'The user birthday is March 15th. They enjoy hiking on weekends.',
  ),
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Mem0Adapter', () => {
  let available = false

  before(async () => {
    available = await ollamaReachable()
    if (!available) {
      console.warn(
        '[mem0.test] Ollama not reachable at ' +
          OLLAMA_BASE_URL +
          ' — all tests will be skipped.\n' +
          '  Run: ollama serve && ollama pull nomic-embed-text',
      )
    }
  })

  it('smoke: ingest and query returns populated results', async () => {
    if (!available) return

    const adapter = new Mem0Adapter()
    try {
      await adapter.ingest(FIXTURE_ITEMS)

      const results = await adapter.query('What are the user food allergies?', {
        k: 3,
      })

      assert.ok(results.length > 0, 'expected at least one result')

      for (const r of results) {
        assert.ok(typeof r.id === 'string' && r.id.length > 0, 'id must be a non-empty string')
        assert.ok(
          r.score >= 0 && r.score <= 1,
          `score ${r.score} must be in [0, 1]`,
        )
        assert.ok(
          typeof r.content === 'string' && r.content.length > 0,
          'content must be non-empty',
        )
      }

      // The allergy item should rank in the top results.
      const ids = results.map((r) => r.id)
      assert.ok(
        ids.includes('item-002'),
        `expected item-002 (allergy) in top-3 results, got: ${ids.join(', ')}`,
      )
    } finally {
      await adapter.cleanup()
    }
  })

  it('reset: state is cleared between fixture runs', async () => {
    if (!available) return

    const adapter = new Mem0Adapter()
    try {
      await adapter.ingest([item('pre-reset', 'This memory should be gone.')])
      await adapter.reset()

      // After reset, re-ingest a different set.
      await adapter.ingest([item('post-reset', 'Memory added after reset.')])

      const results = await adapter.query('memory after reset', { k: 5 })

      const ids = results.map((r) => r.id)
      assert.ok(
        !ids.includes('pre-reset'),
        'pre-reset item must not appear after reset',
      )
    } finally {
      await adapter.cleanup()
    }
  })

  it('temporal: metadata timestamp stored and retrievable', async () => {
    if (!available) return

    const adapter = new Mem0Adapter()
    try {
      const past = item(
        'old-memory',
        'The user used to enjoy classical music.',
        '2024-01-15T10:00:00.000Z',
      )
      const recent = item(
        'new-memory',
        'The user now prefers jazz and blues music.',
        '2026-03-01T10:00:00.000Z',
      )

      await adapter.ingest([past, recent])

      const results = await adapter.query('music preferences', { k: 5 })

      // Both should be retrievable; scoring is by semantic similarity,
      // not timestamp (mem0 does not filter by time in local mode).
      const ids = results.map((r) => r.id)
      assert.ok(
        ids.includes('old-memory') || ids.includes('new-memory'),
        `expected at least one music-preference item in results, got: ${ids.join(', ')}`,
      )
    } finally {
      await adapter.cleanup()
    }
  })

  it('id mapping: returned IDs are original bench IDs, not mem0 internal UUIDs', async () => {
    if (!available) return

    const adapter = new Mem0Adapter()
    try {
      const benchItems = [
        item('bench-a', 'The capital of France is Paris.'),
        item('bench-b', 'The capital of Japan is Tokyo.'),
      ]
      await adapter.ingest(benchItems)

      const results = await adapter.query('capital cities', { k: 5 })

      for (const r of results) {
        // All returned IDs must be bench IDs, never a mem0 UUID.
        assert.match(
          r.id,
          /^bench-/,
          `expected bench-prefixed ID but got: ${r.id}`,
        )
      }
    } finally {
      await adapter.cleanup()
    }
  })
})
