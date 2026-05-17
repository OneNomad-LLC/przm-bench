#!/usr/bin/env node
/**
 * validate-fixtures.ts
 *
 * Validates every JSON file in fixtures/ against FixtureSchema.
 *
 * Usage:
 *   npx tsx scripts/validate-fixtures.ts
 *   node --import tsx scripts/validate-fixtures.ts
 *
 * Exit 0 — all fixtures valid.
 * Exit 1 — one or more fixtures failed validation.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FixtureSchema } from '../src/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const fixturesDir = resolve(__dirname, '..', 'fixtures')

function collectJsonFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...collectJsonFiles(full))
    } else if (entry.endsWith('.json')) {
      files.push(full)
    }
  }
  return files
}

const files = collectJsonFiles(fixturesDir)

if (files.length === 0) {
  console.error('No JSON files found in fixtures/')
  process.exit(1)
}

let allPassed = true

for (const file of files) {
  const rel = file.replace(fixturesDir, 'fixtures')
  let raw: string
  try {
    raw = readFileSync(file, 'utf-8')
  } catch (err) {
    console.error(`[FAIL] ${rel} — could not read file: ${err instanceof Error ? err.message : String(err)}`)
    allPassed = false
    continue
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(`[FAIL] ${rel} — invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
    allPassed = false
    continue
  }

  const result = FixtureSchema.safeParse(parsed)
  if (!result.success) {
    console.error(`[FAIL] ${rel}`)
    for (const issue of result.error.issues) {
      console.error(`       ${issue.path.join('.')} — ${issue.message}`)
    }
    allPassed = false
  } else {
    const fixture = result.data
    // Cross-reference check: every expectedAnswerId must exist in items
    const itemIds = new Set(fixture.items.map(i => i.id))
    let refErrors = 0
    for (const query of fixture.queries) {
      for (const expectedId of query.expectedAnswerIds) {
        if (!itemIds.has(expectedId)) {
          if (refErrors === 0) console.error(`[FAIL] ${rel}`)
          console.error(`       query ${query.id}: expectedAnswerIds references unknown item id "${expectedId}"`)
          refErrors++
          allPassed = false
        }
      }
    }
    if (refErrors === 0) {
      console.log(`[ OK ] ${rel} — ${fixture.items.length} items, ${fixture.queries.length} queries`)
    }
  }
}

if (!allPassed) {
  process.exit(1)
}

console.log('\nAll fixtures valid.')
