/**
 * Convergence-benchmark fixture loader.
 *
 * Mirrors src/fixtures.ts but loads ConvergenceScenarioSchema-shaped
 * files from fixtures/convergence/<category>/*.json.
 */

import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  ConvergenceScenarioSchema,
  type ConvergenceScenario,
} from './types-convergence.js'

function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']'
  const record = obj as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + canonicalize(record[k]))
  return '{' + pairs.join(',') + '}'
}

/**
 * SHA-256 hex digest of a scenario's canonicalized JSON. Pinned in the
 * convergence receipt so a published receipt is bound to specific scenario
 * content; editing a scenario invalidates the receipt.
 */
export function hashScenario(scenario: ConvergenceScenario): string {
  return createHash('sha256').update(canonicalize(scenario), 'utf8').digest('hex')
}

export async function loadConvergenceScenario(
  path: string,
): Promise<ConvergenceScenario> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(path, 'utf-8'))
  } catch (err) {
    throw new Error(
      `Convergence scenario ${path} is not valid JSON: ${(err as Error).message}`,
    )
  }
  const result = ConvergenceScenarioSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(
      `Convergence scenario ${path} failed schema validation:\n${result.error.message}`,
    )
  }
  return result.data
}

/**
 * Load every `*.json` file under `fixtures/convergence/<category>/`,
 * sorted by path. Throws on any single file's parse/validation error —
 * bad fixtures fail loudly at bench start rather than silently miscoring.
 */
export async function loadConvergenceCategory(
  fixturesRoot: string,
  category: string,
): Promise<ConvergenceScenario[]> {
  const dir = join(fixturesRoot, category)
  if (!existsSync(dir)) {
    throw new Error(`Convergence category dir not found: ${dir}`)
  }
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()
  const scenarios: ConvergenceScenario[] = []
  for (const f of files) {
    scenarios.push(await loadConvergenceScenario(join(dir, f)))
  }
  return scenarios
}

/**
 * Load every category under `fixtures/convergence/` and return a flat
 * array of scenarios from all categories.
 */
export async function loadAllConvergenceScenarios(
  fixturesRoot: string,
): Promise<ConvergenceScenario[]> {
  if (!existsSync(fixturesRoot)) {
    throw new Error(`Convergence fixtures root not found: ${fixturesRoot}`)
  }
  const entries = await readdir(fixturesRoot, { withFileTypes: true })
  const categories = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  const out: ConvergenceScenario[] = []
  for (const cat of categories) {
    out.push(...(await loadConvergenceCategory(fixturesRoot, cat)))
  }
  return out
}
