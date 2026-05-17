import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { FixtureSchema } from './types.js'
import type { Fixture } from './types.js'

// TODO(integration): canonicalize lives in src/receipt/canonicalize.ts which
// is owned by the receipt/signing track (not yet merged). Until that track
// lands, we use a local sort-keys-then-stringify implementation that is
// functionally identical: sorted keys, no whitespace. If the receipt track's
// canonicalize.ts exports a `canonicalize(obj: unknown): string` function,
// replace the local function below with:
//   import { canonicalize } from './receipt/canonicalize.js'
function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']'
  }
  const record = obj as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + canonicalize(record[k]))
  return '{' + pairs.join(',') + '}'
}

/**
 * Compute the SHA-256 hex digest of a fixture's canonicalized JSON.
 * Used to pin the fixture content in a receipt.
 */
export function hashFixture(fixture: Fixture): string {
  const canonical = canonicalize(fixture)
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Load and validate a single fixture from a JSON file path.
 * Throws on parse error or schema validation failure — bad fixtures fail
 * loudly at bench start rather than silently miscoring.
 */
export async function loadFixture(path: string): Promise<Fixture> {
  let raw: unknown
  try {
    const text = await readFile(path, 'utf-8')
    raw = JSON.parse(text)
  } catch (err) {
    throw new Error(
      `Fixture ${path} is not valid JSON: ${(err as Error).message}`,
    )
  }
  const result = FixtureSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(
      `Fixture ${path} failed schema validation:\n${result.error.message}`,
    )
  }
  return result.data
}

/**
 * Load all *.json files in a directory as fixtures.
 * Files are loaded in sorted order for deterministic sequencing.
 * Throws on any parse or validation error.
 */
export async function loadFixturesDir(dir: string): Promise<Fixture[]> {
  if (!existsSync(dir)) {
    throw new Error(`Fixtures directory not found: ${dir}`)
  }
  const entries = await readdir(dir)
  const jsonFiles = entries.filter((f) => f.endsWith('.json')).sort()

  const fixtures: Fixture[] = []
  for (const file of jsonFiles) {
    const filePath = join(dir, file)
    fixtures.push(await loadFixture(filePath))
  }
  return fixtures
}

/**
 * Synchronous variant for CLI use at startup. Identical logic to loadFixture
 * but uses readFileSync — only call this during initialisation before the
 * event loop is needed for adapter work.
 */
export function loadFixtureSync(path: string): Fixture {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    throw new Error(
      `Fixture ${path} is not valid JSON: ${(err as Error).message}`,
    )
  }
  const result = FixtureSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(
      `Fixture ${path} failed schema validation:\n${result.error.message}`,
    )
  }
  return result.data
}
