#!/usr/bin/env node
/**
 * build-longmemeval-holdout.ts
 *
 * Reproducible 80/20 split of the LongMemEval temporal-reasoning subset
 * into seen and holdout fixture files.
 *
 * Seed derivation
 * ---------------
 * Seed string: "MATT-2026-05-17"
 * SHA-256 of that UTF-8 string → take first 4 bytes → read as big-endian
 * uint32 → Mulberry32 PRNG initialised from that value → seeded
 * Fisher-Yates shuffle of the 133-entry temporal-reasoning index array.
 * Two runs of this script from the same source data produce byte-identical
 * fixtures.
 *
 * Design decisions
 * ----------------
 * A. Total size: all 133 temporal-reasoning questions (80% = 106 seen,
 *    20% = 27 holdout). Using the full subset maximises statistical power.
 *    With R@10 near 99%, 27 holdout questions yields ~±2pp standard error —
 *    inside the ±3pp detection threshold. Subsampling to e.g. 100 would
 *    raise variance without benefit.
 *
 * B. Items: every question in LongMemEval has its own isolated haystack of
 *    ~48 sessions. All haystack sessions are included as FixtureItems —
 *    non-answer sessions serve as distractors. This makes the retrieval task
 *    realistic (find the correct 1–6 sessions in ~47 candidates). Session IDs
 *    are namespaced as `{questionId}:{sessionId}` to prevent collisions
 *    between questions sharing sessions from the same user. The fixture items
 *    array is the union of all haystacks; each query's expectedAnswerIds point
 *    to the namespaced IDs of its answer sessions. No items are dropped.
 *
 * Usage
 * -----
 *   # 1. Ensure the dataset is present (engram's download-datasets.sh covers this):
 *   #    engram/benchmarks/data/longmemeval_s_cleaned.json   (~277 MB)
 *   #    Or download directly:
 *   #    curl -fsSL -o /path/to/longmemeval_s_cleaned.json \
 *   #      https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json
 *
 *   npx tsx scripts/build-longmemeval-holdout.ts [--input /path/to/longmemeval_s_cleaned.json]
 *
 *   # Default input path (checked in order):
 *   #   $LME_DATA_PATH env var
 *   #   ../engram/benchmarks/data/longmemeval_s_cleaned.json (sibling repo)
 *   #   benchmarks/data/longmemeval_s_cleaned.json
 *
 * Outputs (written to fixtures/)
 * --------
 *   fixtures/longmemeval-temporal-inference-full-seen.json
 *   fixtures/longmemeval-temporal-inference-full-holdout.json
 *
 * The raw dataset is NOT committed (277 MB). Add to .gitignore as needed.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Fixture, FixtureItem, FixtureQuery } from '../src/types.js'

// ── Constants ───────────────────────────────────────────────────────

const SEED_STRING = 'MATT-2026-05-17'
const SPLIT_RATIO = 0.8 // 80% seen, 20% holdout
const QUESTION_TYPE = 'temporal-reasoning'
const MIT_LICENSE_TEXT =
  'LongMemEval dataset by Xiaowu Li et al. Licensed under MIT. ' +
  'Source: https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned. ' +
  'Paper: "LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory" (2024).'

// ── Raw dataset types ────────────────────────────────────────────────

interface LMESession {
  role: string
  content: string
  has_answer?: boolean
}

interface LMEEntry {
  question_id: string
  question_type: string
  question: string
  answer: string | number
  question_date: string
  haystack_session_ids: string[]
  haystack_dates: string[]
  haystack_sessions: LMESession[][]
  answer_session_ids: string[]
}

// ── Extended FixtureSchema shape (includes _license field) ──────────

interface FixtureWithLicense extends Fixture {
  _license: string
}

// ── PRNG: Mulberry32 ─────────────────────────────────────────────────

/**
 * Mulberry32 PRNG — fast, seedable, produces uniform [0,1) floats.
 * Returns a generator function; each call advances the state.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return (): number => {
    s += 0x6d2b79f5
    let z = s
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000
  }
}

/**
 * Seeded Fisher-Yates shuffle. Returns a new array (input unchanged).
 */
function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Seed derivation ─────────────────────────────────────────────────

function deriveSeed(seedString: string): number {
  const hash = createHash('sha256').update(seedString, 'utf8').digest()
  // Big-endian uint32 from first 4 bytes
  return ((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 0
}

// ── Date parsing ─────────────────────────────────────────────────────

/**
 * Parse LongMemEval date strings like "2023/02/01 (Wed) 10:20"
 * into ISO8601 datetime strings.
 *
 * Returns null if unparseable — callers treat null as "no `when` field".
 */
function parseLMEDate(raw: string): string | null {
  // Format: "YYYY/MM/DD (Dow) HH:MM"
  const m = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+\([A-Za-z]+\)\s+(\d{2}):(\d{2})/)
  if (!m) return null
  const [, year, month, day, hour, minute] = m
  return `${year}-${month}-${day}T${hour}:${minute}:00.000Z`
}

// ── Conversion ───────────────────────────────────────────────────────

/**
 * Convert a single LMEEntry to FixtureItems (all haystack sessions)
 * and a FixtureQuery. Session IDs are namespaced as
 * `{questionId}:{sessionId}` to prevent collisions when entries share
 * sessions from the same user's conversation history.
 */
function convertEntry(
  entry: LMEEntry,
): { items: FixtureItem[]; query: FixtureQuery } {
  const items: FixtureItem[] = []
  const answerIdSet = new Set(entry.answer_session_ids)

  for (let i = 0; i < entry.haystack_session_ids.length; i++) {
    const rawSessionId = entry.haystack_session_ids[i]
    const sessionId = `${entry.question_id}:${rawSessionId}`
    const rawDate = entry.haystack_dates[i] ?? ''
    const parsedDate = parseLMEDate(rawDate)

    // Concatenate all turns into a single content string
    const turns = entry.haystack_sessions[i] ?? []
    const content = turns.map((t) => `${t.role}: ${t.content}`).join('\n')

    if (content.trim().length === 0) continue

    const item: FixtureItem = {
      id: sessionId,
      content,
      metadata: {
        raw_session_id: rawSessionId,
        question_id: entry.question_id,
        is_answer_session: answerIdSet.has(rawSessionId),
        session_index: i,
      },
      // FixtureItemSchema requires timestamp as ISO8601. Fall back to a
      // synthetic timestamp (question_date epoch - (n_sessions - i) days)
      // when the haystack date is unparseable, so the fixture is always
      // fully typed.
      timestamp: parsedDate ?? syntheticTimestamp(entry.question_date, i, entry.haystack_session_ids.length),
    }

    items.push(item)
  }

  // Build expectedAnswerIds — only include IDs that ended up in items
  const itemIdSet = new Set(items.map((it) => it.id))
  const expectedAnswerIds = entry.answer_session_ids
    .map((rawId) => `${entry.question_id}:${rawId}`)
    .filter((id) => itemIdSet.has(id))

  const questionDate = parseLMEDate(entry.question_date)

  const query: FixtureQuery = {
    id: entry.question_id,
    query: entry.question,
    expectedAnswerIds,
    ...(questionDate !== null ? { when: questionDate } : {}),
    category: QUESTION_TYPE,
  }

  return { items, query }
}

/**
 * Synthetic fallback timestamp when a haystack date can't be parsed.
 * Distributes sessions linearly before the question date.
 */
function syntheticTimestamp(
  questionDateRaw: string,
  sessionIndex: number,
  totalSessions: number,
): string {
  const questionDate = parseLMEDate(questionDateRaw)
  const base = questionDate !== null ? new Date(questionDate).getTime() : Date.now()
  // Spread sessions evenly over 90 days before question date
  const offsetMs = ((totalSessions - sessionIndex) / totalSessions) * 90 * 24 * 60 * 60 * 1000
  return new Date(base - offsetMs).toISOString()
}

// ── Build ─────────────────────────────────────────────────────────────

function findDatasetPath(cliArg: string | undefined): string {
  if (cliArg && existsSync(cliArg)) return cliArg
  if (process.env.LME_DATA_PATH && existsSync(process.env.LME_DATA_PATH)) {
    return process.env.LME_DATA_PATH
  }

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(__dirname, '..', '..', 'engram', 'benchmarks', 'data', 'longmemeval_s_cleaned.json'),
    resolve(__dirname, '..', 'benchmarks', 'data', 'longmemeval_s_cleaned.json'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error(
    'Dataset not found. Download it first:\n' +
      '  curl -fsSL -o longmemeval_s_cleaned.json \\\n' +
      '    https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json\n' +
      'Then pass --input /path/to/longmemeval_s_cleaned.json or set $LME_DATA_PATH.',
  )
}

function buildFixture(
  entries: LMEEntry[],
  id: string,
  description: string,
): FixtureWithLicense {
  const allItems: FixtureItem[] = []
  const allQueries: FixtureQuery[] = []
  const seenItemIds = new Set<string>()

  let skippedItems = 0

  for (const entry of entries) {
    const { items, query } = convertEntry(entry)

    if (query.expectedAnswerIds.length === 0) {
      console.warn(`  [WARN] Skipping query ${entry.question_id}: no resolvable expectedAnswerIds`)
      continue
    }

    for (const item of items) {
      if (seenItemIds.has(item.id)) {
        // Namespacing should prevent this, but guard defensively
        skippedItems++
        continue
      }
      seenItemIds.add(item.id)
      allItems.push(item)
    }

    allQueries.push(query)
  }

  if (skippedItems > 0) {
    console.warn(`  [WARN] Skipped ${skippedItems} duplicate item IDs (unexpected)`)
  }

  return {
    _license: MIT_LICENSE_TEXT,
    id,
    benchmark: 'longmemeval',
    subset: 'temporal-inference',
    description,
    items: allItems,
    queries: allQueries,
    notes:
      'Converted from xiaowu0162/longmemeval-cleaned (MIT). ' +
      'Each query\'s haystack sessions are all included as items (answer sessions + distractors). ' +
      'Item IDs are namespaced as {questionId}:{sessionId} to prevent cross-question collisions. ' +
      `Split seed: SHA256("${SEED_STRING}") → first 4 bytes → big-endian uint32 → Mulberry32 PRNG → Fisher-Yates shuffle. ` +
      'Reproduced by running: npx tsx scripts/build-longmemeval-holdout.ts',
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const inputArgIdx = args.findIndex((a) => a === '--input')
  const inputArg = inputArgIdx >= 0 ? args[inputArgIdx + 1] : undefined

  const dataPath = findDatasetPath(inputArg)
  console.log(`Loading dataset from: ${dataPath}`)

  const raw = readFileSync(dataPath, 'utf-8')
  const dataset: LMEEntry[] = JSON.parse(raw) as LMEEntry[]
  console.log(`Loaded ${dataset.length} total entries`)

  // Filter to temporal-reasoning
  const temporal = dataset.filter((e) => e.question_type === QUESTION_TYPE)
  console.log(`Filtered to ${temporal.length} ${QUESTION_TYPE} entries`)

  if (temporal.length === 0) {
    throw new Error(`No entries with question_type="${QUESTION_TYPE}" found.`)
  }

  // Derive seed and shuffle
  const seed = deriveSeed(SEED_STRING)
  console.log(`Seed: SHA256("${SEED_STRING}") → 0x${seed.toString(16).padStart(8, '0')} (${seed})`)

  const rand = mulberry32(seed)
  const shuffled = shuffle(temporal, rand)

  // Split
  const splitIdx = Math.round(shuffled.length * SPLIT_RATIO)
  const seenEntries = shuffled.slice(0, splitIdx)
  const holdoutEntries = shuffled.slice(splitIdx)

  console.log(`Split: ${seenEntries.length} seen / ${holdoutEntries.length} holdout`)

  // Build fixtures
  console.log('Building seen fixture...')
  const seenFixture = buildFixture(
    seenEntries,
    'longmemeval-temporal-inference-full-seen',
    `LongMemEval temporal-reasoning seen split (80%, n=${seenEntries.length} questions, ` +
      `${seenEntries.reduce((s, e) => s + e.haystack_session_ids.length, 0)} total haystack sessions). ` +
      `Converted from the full dataset; split by seeded 80/20 permutation. Holdout split is in ` +
      `longmemeval-temporal-inference-full-holdout.json — see fixtures/HOLDOUT_PROTOCOL.md.`,
  )

  console.log('Building holdout fixture...')
  const holdoutFixture = buildFixture(
    holdoutEntries,
    'longmemeval-temporal-inference-full-holdout',
    `LongMemEval temporal-reasoning holdout split (20%, n=${holdoutEntries.length} questions, ` +
      `${holdoutEntries.reduce((s, e) => s + e.haystack_session_ids.length, 0)} total haystack sessions). ` +
      `HOLDOUT — see fixtures/HOLDOUT_PROTOCOL.md. Engineers and agents making Engram changes ` +
      `MUST NOT read or act on this fixture's query texts.`,
  )

  // Write outputs
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const fixturesDir = resolve(__dirname, '..', 'fixtures')

  const seenPath = join(fixturesDir, 'longmemeval-temporal-inference-full-seen.json')
  const holdoutPath = join(fixturesDir, 'longmemeval-temporal-inference-full-holdout.json')

  writeFileSync(seenPath, JSON.stringify(seenFixture, null, 2), 'utf-8')
  console.log(`Written: ${seenPath}`)
  console.log(`  ${seenFixture.queries.length} queries, ${seenFixture.items.length} items`)

  writeFileSync(holdoutPath, JSON.stringify(holdoutFixture, null, 2), 'utf-8')
  console.log(`Written: ${holdoutPath}`)
  console.log(`  ${holdoutFixture.queries.length} queries, ${holdoutFixture.items.length} items`)

  // Print summary
  console.log('')
  console.log('Summary')
  console.log('-------')
  console.log(`Source: ${QUESTION_TYPE}, n=${temporal.length}`)
  console.log(`Seed string: "${SEED_STRING}"`)
  console.log(`Seed uint32: 0x${seed.toString(16).padStart(8, '0')}`)
  console.log(`Split: ${seenEntries.length} seen / ${holdoutEntries.length} holdout`)
  console.log(`Seen fixture: ${seenFixture.queries.length} queries, ${seenFixture.items.length} items`)
  console.log(`Holdout fixture: ${holdoutFixture.queries.length} queries, ${holdoutFixture.items.length} items`)
  console.log('')
  console.log('IMPORTANT: Do not read holdout queries. See fixtures/HOLDOUT_PROTOCOL.md.')
}

main()
