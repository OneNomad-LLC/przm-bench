#!/usr/bin/env node
/**
 * onenomad-bench CLI
 *
 * USAGE
 *   onenomad-bench run --adapter <name> --fixture <path> [--out <path>]
 *   onenomad-bench verify <receipt-path>
 *
 * The `run` subcommand writes an UNSIGNED receipt JSON. Signing is performed
 * by CI via the receipt/sign.ts surface (separate track — see TODO below).
 *
 * Adapters are resolved dynamically:
 *   await import('./adapters/' + name + '.js')
 * Each adapter file must export a default class/object implementing Adapter,
 * or a named export matching the PascalCase adapter name.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Adapter } from './types.js'
import { loadFixtureSync, hashFixture } from './fixtures.js'
import { runBenchmark } from './runner.js'

// TODO(integration): receipt/index.ts is owned by the signing track.
// Until it lands, verifyReceipt is stubbed below.
// Replace with:
//   import { verifyReceipt } from './receipt/index.js'
async function verifyReceipt(receiptPath: string): Promise<void> {
  console.error(
    `[TODO] verifyReceipt not yet wired — receipt/index.ts is pending the signing track.\nPath: ${receiptPath}`,
  )
  process.exit(1)
}

const HERE = dirname(fileURLToPath(import.meta.url))
const BENCH_VERSION = '0.0.1'

// ── Environment capture ───────────────────────────────────────────────

function getGitInfo(): { commit: string; dirty: boolean } {
  try {
    const commit = execSync('git rev-parse HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    const dirty =
      execSync('git status --porcelain', {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim().length > 0
    return { commit, dirty }
  } catch {
    // Not a git repo or git not available — use a placeholder that
    // clearly indicates the receipt is not reproducible.
    return { commit: '0000000000000000000000000000000000000000', dirty: true }
  }
}

// ── Argument parsing ─────────────────────────────────────────────────

interface RunArgs {
  adapter: string
  fixture: string
  out?: string
}

interface ParsedArgs {
  command: 'run' | 'verify' | 'help'
  run?: RunArgs
  verifyPath?: string
}

function parseArgs(argv: string[]): ParsedArgs {
  const rest = argv.slice(2)
  const [command] = rest

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { command: 'help' }
  }

  if (command === 'run') {
    const args: Partial<RunArgs> = {}
    for (let i = 1; i < rest.length; i++) {
      const cur = rest[i]!
      const next = rest[i + 1]
      if ((cur === '--adapter' || cur === '-a') && next) {
        args.adapter = next
        i++
      } else if ((cur === '--fixture' || cur === '-f') && next) {
        args.fixture = next
        i++
      } else if ((cur === '--out' || cur === '-o') && next) {
        args.out = next
        i++
      }
    }
    if (!args.adapter) {
      console.error('Error: --adapter <name> is required')
      process.exit(1)
    }
    if (!args.fixture) {
      console.error('Error: --fixture <path> is required')
      process.exit(1)
    }
    return { command: 'run', run: args as RunArgs }
  }

  if (command === 'verify') {
    const verifyPath = rest[1]
    if (!verifyPath) {
      console.error('Error: verify requires a receipt path argument')
      process.exit(1)
    }
    return { command: 'verify', verifyPath }
  }

  console.error(`Unknown command: ${command}`)
  printHelp()
  process.exit(1)
}

// ── Adapter resolution ───────────────────────────────────────────────

async function resolveAdapter(name: string): Promise<Adapter> {
  // Adapters are loaded dynamically so new adapter files are picked up
  // without modifying the CLI. Each adapter file at
  // src/adapters/<name>.ts must export a default that is an Adapter
  // instance, or a named export `adapter` of the same shape.
  const adapterPath = join(HERE, 'adapters', name + '.js')
  let mod: Record<string, unknown>
  try {
    mod = (await import(adapterPath)) as Record<string, unknown>
  } catch (err) {
    throw new Error(
      `Could not load adapter "${name}" from ${adapterPath}.\n` +
        `Make sure src/adapters/${name}.ts exists and exports a default Adapter.\n` +
        `Original error: ${(err as Error).message}`,
    )
  }

  // Support default export or named `adapter` export.
  const candidate = mod['default'] ?? mod['adapter']
  if (!candidate || typeof (candidate as Adapter).ingest !== 'function') {
    throw new Error(
      `Adapter "${name}" does not export a valid Adapter (missing .ingest method).`,
    )
  }
  return candidate as Adapter
}

// ── Commands ─────────────────────────────────────────────────────────

async function cmdRun(args: RunArgs): Promise<void> {
  // Load and validate fixture
  console.error(`Loading fixture: ${args.fixture}`)
  const fixture = loadFixtureSync(args.fixture)
  const fixtureSha = hashFixture(fixture)
  console.error(
    `Fixture: ${fixture.id} (${fixture.items.length} items, ${fixture.queries.length} queries)`,
  )

  // Load adapter
  console.error(`Loading adapter: ${args.adapter}`)
  const adapter = await resolveAdapter(args.adapter)
  console.error(`Adapter: ${adapter.name} v${adapter.version}`)

  // Run
  console.error('Running benchmark...')
  const { scores, perQuery } = await runBenchmark({ adapter, fixture })

  // Print summary to stderr
  console.error('')
  console.error('='.repeat(60))
  console.error('RESULTS')
  console.error('='.repeat(60))
  console.error(`recall@5   ${(scores.recall_at_5 * 100).toFixed(1)}%`)
  console.error(`recall@10  ${(scores.recall_at_10 * 100).toFixed(1)}%`)
  console.error(`ndcg@10    ${(scores.ndcg_at_10 * 100).toFixed(1)}%`)
  console.error(`p50 lat    ${scores.latency_p50_ms.toFixed(0)}ms`)
  console.error(`p95 lat    ${scores.latency_p95_ms.toFixed(0)}ms`)
  console.error(
    `ingest     ${scores.ingest_throughput_items_per_sec.toFixed(1)} items/sec`,
  )
  console.error('='.repeat(60))

  // Build UNSIGNED receipt
  const git = getGitInfo()
  const receipt = {
    receiptId: randomUUID(),
    benchVersion: BENCH_VERSION,
    ranAt: new Date().toISOString(),
    adapter: {
      name: adapter.name,
      version: adapter.version,
    },
    fixture: {
      id: fixture.id,
      sha256: fixtureSha,
      n: fixture.items.length,
    },
    environment: {
      node: process.version,
      platform: process.platform + '/' + process.arch,
      git,
    },
    scores,
    perQuery,
    // signature field intentionally absent — CI adds it via receipt/sign.ts
  }

  // Determine output path
  let outPath = args.out
  if (!outPath) {
    const resultsDir = join(HERE, '..', 'results')
    mkdirSync(resultsDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    outPath = join(resultsDir, `${adapter.name}-${fixture.id}-${stamp}.json`)
  }

  writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n')
  console.error(`\nReceipt (unsigned): ${outPath}`)
  // Echo the path to stdout so CI can capture it easily
  console.log(outPath)
}

function printHelp(): void {
  console.log(`onenomad-bench — vendor-neutral AI memory benchmark

USAGE
  onenomad-bench run --adapter <name> --fixture <path> [--out <path>]
  onenomad-bench verify <receipt-path>
  onenomad-bench help

SUBCOMMANDS
  run      Run a fixture against an adapter and write an unsigned receipt JSON.
  verify   Verify a signed receipt (requires receipt/sign.ts track to be merged).

OPTIONS (run)
  --adapter, -a <name>   Adapter name. File src/adapters/<name>.ts must exist.
  --fixture, -f <path>   Path to a fixture JSON file.
  --out, -o <path>       Output path for the receipt JSON.
                         Default: ./results/<adapter>-<fixture>-<timestamp>.json

ADAPTERS
  Adapters are loaded dynamically from src/adapters/<name>.ts.
  Each file must export a default Adapter or a named export 'adapter'.
  No adapters are bundled — they are implemented in separate tracks.

NOTES
  - Receipts emitted by 'run' are unsigned. Signing happens in CI.
  - 'verify' requires the receipt/signing track (separate PR).
`)
}

// ── Entry point ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv)

  switch (parsed.command) {
    case 'run':
      await cmdRun(parsed.run!)
      break
    case 'verify':
      await verifyReceipt(parsed.verifyPath!)
      break
    default:
      printHelp()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
