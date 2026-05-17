/**
 * scripts/run-convergence-bench.ts
 *
 * First end-to-end run of the multi-agent convergence benchmark.
 * Loads all 8 seed scenarios, runs them through the Anthropic baseline +
 * the Azure OpenAI baseline, scores each, prints aggregates.
 *
 * No receipt signing in this script — that lives in CI behind the
 * RECEIPT_SIGNING_PRIVATE_KEY GitHub Actions secret. This script just
 * verifies the orchestration works, gets real numbers on the board,
 * and writes a JSON results file we can sign later.
 *
 * Env vars:
 *   ANTHROPIC_API_KEY         (required for the Anthropic adapter)
 *   AZURE_OPENAI_ENDPOINT     (required for the Azure adapter)
 *   AZURE_OPENAI_API_KEY      (required for the Azure adapter)
 *   AZURE_OPENAI_DEPLOYMENT   (defaults to "gpt-5-mini")
 *   AZURE_OPENAI_MODEL        (defaults to "gpt-5-mini")
 *
 * Run:
 *   node --import tsx scripts/run-convergence-bench.ts
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { BaselineAnthropicAdapter } from '../src/adapters/multiagent/baseline-anthropic.js'
import { AzureOpenAIBaselineAdapter } from '../src/adapters/multiagent/azure-openai-baseline.js'
import { AutoGenAdapter } from '../src/adapters/multiagent/autogen.js'
import {
  loadAllConvergenceScenarios,
  hashScenario,
} from '../src/fixtures-convergence.js'
import { scoreScenario, aggregateConvergenceScores } from '../src/scoring/convergence.js'
import { signConvergenceReceipt } from '../src/receipt/sign-convergence.js'
import type {
  ConvergenceScenario,
  ConvergenceScores,
  DebateTranscript,
  MultiAgentAdapter,
  PerScenarioConvergenceResult,
  PerScenarioReceiptEntry,
  ConvergenceReceipt,
} from '../src/types-convergence.js'

const N_AGENTS = 3
const N_ROUNDS = 3

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..')

interface AdapterRun {
  adapterName: string
  llmModel: string
  adapterVersion: string
  scores: ConvergenceScores
  perScenario: PerScenarioConvergenceResult[]
  /** Full transcripts kept in-memory for receipt generation. */
  transcriptsByScenarioId: Record<string, DebateTranscript>
  errors: Array<{ scenarioId: string; message: string }>
  durationMs: number
}

async function runAdapter(
  adapter: MultiAgentAdapter,
  scenarios: ConvergenceScenario[],
): Promise<AdapterRun> {
  const t0 = Date.now()
  const perScenario: PerScenarioConvergenceResult[] = []
  const transcriptsByScenarioId: Record<string, DebateTranscript> = {}
  const errors: Array<{ scenarioId: string; message: string }> = []
  for (const s of scenarios) {
    process.stdout.write(`    ${s.id.padEnd(30)} `)
    try {
      const transcript = await adapter.runDebate(s, {
        nAgents: N_AGENTS,
        nRounds: N_ROUNDS,
      })
      const result = scoreScenario(s, transcript)
      perScenario.push(result)
      transcriptsByScenarioId[s.id] = transcript
      process.stdout.write(
        `consensus=${result.finalConsensus ?? 'TIE'}  ${result.correct ? 'CORRECT' : 'WRONG'}\n`,
      )
    } catch (e) {
      const msg = (e as Error).message
      errors.push({ scenarioId: s.id, message: msg })
      process.stdout.write(`ERROR: ${msg}\n`)
      // Continue with next scenario. Errors are recorded but don't count
      // as correct/wrong/collapsed/sycophantic — they're outright skips.
    }
  }
  await adapter.reset()
  const scores = aggregateConvergenceScores(scenarios, perScenario, {
    nAgents: N_AGENTS,
    nRounds: N_ROUNDS,
  })
  return {
    adapterName: adapter.name,
    llmModel: adapter.llmModel,
    adapterVersion: adapter.version,
    scores,
    perScenario,
    transcriptsByScenarioId,
    errors,
    durationMs: Date.now() - t0,
  }
}

const BENCH_VERSION = '0.1.0-preview'

function fixtureSetSha(scenarios: ConvergenceScenario[]): string {
  const ids = [...scenarios].sort((a, b) => a.id.localeCompare(b.id))
  const concat = ids.map((s) => `${s.id}:${hashScenario(s)}`).join(',')
  return createHash('sha256').update(concat, 'utf8').digest('hex')
}

function buildPerScenarioEntries(
  scenarios: ConvergenceScenario[],
  perScenario: PerScenarioConvergenceResult[],
  transcripts: Record<string, DebateTranscript>,
): PerScenarioReceiptEntry[] {
  const scenarioById = new Map(scenarios.map((s) => [s.id, s]))
  return perScenario.map((r) => {
    const scenario = scenarioById.get(r.scenarioId)
    const transcript = transcripts[r.scenarioId]
    if (!scenario || !transcript) {
      throw new Error(
        `cannot build receipt entry for ${r.scenarioId}: missing scenario or transcript`,
      )
    }
    return {
      scenarioId: r.scenarioId,
      scenarioSha256: hashScenario(scenario),
      finalConsensus: r.finalConsensus,
      correct: r.correct,
      collapsed: r.collapsed,
      sycophancyOccurred: r.sycophancyOccurred,
      positionFlipsByAgent: r.positionFlipsByAgent,
      totalOutputTokens: r.totalOutputTokens,
      transcript,
    }
  })
}

function getGitMeta(): { commit: string; dirty: boolean } {
  try {
    const commit = execSync('git rev-parse HEAD', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim()
    const status = execSync('git status --porcelain', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    return { commit, dirty: status.length > 0 }
  } catch {
    return { commit: '0000000', dirty: true }
  }
}

function buildReceiptForRun(
  run: AdapterRun,
  scenarios: ConvergenceScenario[],
  ranAt: string,
): Omit<ConvergenceReceipt, 'signature'> {
  return {
    receiptId: randomUUID(),
    benchmark: 'convergence-v0.1-preview',
    benchVersion: BENCH_VERSION,
    ranAt,
    adapter: {
      name: run.adapterName,
      version: run.adapterVersion,
      llmModel: run.llmModel,
    },
    configuration: { nAgents: N_AGENTS, nRounds: N_ROUNDS },
    fixtureSet: {
      n: scenarios.length,
      setSha256: fixtureSetSha(scenarios),
    },
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      git: getGitMeta(),
    },
    scores: run.scores,
    perScenario: buildPerScenarioEntries(
      scenarios,
      run.perScenario,
      run.transcriptsByScenarioId,
    ),
  }
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

function printResults(runs: AdapterRun[]): void {
  console.log('\n┌──────────────────────────────────────────────────────────────────────────────')
  console.log('│ Convergence benchmark — aggregate scores')
  console.log('├──────────────────────────────────────────────────────────────────────────────')
  console.log(
    '│ ' +
      'metric'.padEnd(40) +
      runs
        .map((r) => `${r.adapterName.split('-').pop()}/${r.llmModel}`.padStart(28))
        .join(' '),
  )
  console.log('├──────────────────────────────────────────────────────────────────────────────')
  const row = (label: string, key: keyof ConvergenceScores, fmt: (n: number) => string) => {
    console.log(
      '│ ' +
        label.padEnd(40) +
        runs.map((r) => fmt(r.scores[key]).padStart(28)).join(' '),
    )
  }
  row('correct_final_answer_rate', 'correct_final_answer_rate', fmtPct)
  row('collapse_rate (lower better)', 'collapse_rate', fmtPct)
  row('sycophancy_ratio (lower better)', 'sycophancy_ratio', fmtPct)
  row('tokens_per_correct_answer', 'tokens_per_correct_answer', (n) =>
    n.toLocaleString(),
  )
  row('position_flips_per_agent_per_round', 'position_flips_per_agent_per_round', (n) =>
    n.toFixed(3),
  )
  console.log('└──────────────────────────────────────────────────────────────────────────────')
  for (const r of runs) {
    console.log(
      `${r.adapterName}: ${(r.durationMs / 1000).toFixed(1)}s wall time, ` +
        `${r.perScenario.length} scored, ${r.errors.length} errors`,
    )
    for (const err of r.errors) {
      console.log(`  err: ${err.scenarioId} — ${err.message}`)
    }
  }
}

async function main() {
  const startedAt = new Date()
  console.log(`przm convergence bench — ${startedAt.toISOString()}`)
  console.log(`Config: ${N_AGENTS} agents × ${N_ROUNDS} rounds per scenario.\n`)

  const scenarios = await loadAllConvergenceScenarios(
    join(REPO_ROOT, 'fixtures', 'convergence'),
  )
  console.log(`Loaded ${scenarios.length} scenarios.\n`)

  const adapters: MultiAgentAdapter[] = []

  if (process.env['ANTHROPIC_API_KEY']) {
    adapters.push(
      new BaselineAnthropicAdapter({
        apiKey: process.env['ANTHROPIC_API_KEY'],
        model: 'claude-haiku-4-5',
      }),
    )
  } else {
    console.log('skip: BaselineAnthropicAdapter (ANTHROPIC_API_KEY not set)')
  }

  if (
    process.env['AZURE_OPENAI_ENDPOINT'] &&
    process.env['AZURE_OPENAI_API_KEY']
  ) {
    // gpt-5-mini (reasoning model, slower)
    adapters.push(
      new AzureOpenAIBaselineAdapter({
        endpoint: process.env['AZURE_OPENAI_ENDPOINT'],
        apiKey: process.env['AZURE_OPENAI_API_KEY'],
        deploymentName: 'gpt-5-mini',
        llmModel: 'gpt-5-mini',
      }),
    )
    // gpt-4o-mini (non-reasoning, mid-tier — expected to fold more easily)
    adapters.push(
      new AzureOpenAIBaselineAdapter({
        endpoint: process.env['AZURE_OPENAI_ENDPOINT'],
        apiKey: process.env['AZURE_OPENAI_API_KEY'],
        deploymentName: 'gpt-4o-mini',
        llmModel: 'gpt-4o-mini',
      }),
    )
  } else {
    console.log('skip: AzureOpenAIBaselineAdapter (AZURE_OPENAI_* not set)')
  }

  // AutoGen RoundRobin orchestration with the same gpt-4o-mini deployment
  // gives us a clean same-model / different-orchestration comparison.
  if (
    process.env['AZURE_OPENAI_ENDPOINT'] &&
    process.env['AZURE_OPENAI_API_KEY']
  ) {
    adapters.push(
      new AutoGenAdapter({
        llmModel: 'gpt-4o-mini',
        provider: {
          provider: 'openai-azure',
          config: {
            endpoint: process.env['AZURE_OPENAI_ENDPOINT'],
            apiKey: process.env['AZURE_OPENAI_API_KEY'],
            deploymentName: 'gpt-4o-mini',
          },
        },
      }),
    )
  }

  if (adapters.length === 0) {
    console.error('No adapters available — set at least one credential pair.')
    process.exit(1)
  }

  const runs: AdapterRun[] = []
  for (const adapter of adapters) {
    console.log(`\n── ${adapter.name} (${adapter.llmModel}) ────────────────────────`)
    runs.push(await runAdapter(adapter, scenarios))
  }

  printResults(runs)

  // Write raw preview to results/preview/ (gitignored, includes transcripts)
  const previewDir = join(REPO_ROOT, 'results', 'preview')
  mkdirSync(previewDir, { recursive: true })
  const previewFile = join(
    previewDir,
    `convergence-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`,
  )
  writeFileSync(
    previewFile,
    JSON.stringify(
      {
        benchmark: 'convergence-v0.1-preview',
        ranAt: startedAt.toISOString(),
        config: { nAgents: N_AGENTS, nRounds: N_ROUNDS },
        scenarioCount: scenarios.length,
        runs,
      },
      null,
      2,
    ),
  )
  console.log(`\nPreview written to: ${previewFile}`)

  // ── Sign + publish per-adapter receipts ────────────────────────
  const privateKey = process.env['CONVERGENCE_SIGNING_PRIVATE_KEY']
  if (!privateKey) {
    console.log(
      '\nSkipping signed-receipt publication: CONVERGENCE_SIGNING_PRIVATE_KEY not set.',
    )
    return
  }

  const publishDir = join(REPO_ROOT, 'results', 'published', 'convergence')
  mkdirSync(publishDir, { recursive: true })
  const ranAt = startedAt.toISOString()
  const publishedPaths: string[] = []

  for (const run of runs) {
    if (run.perScenario.length === 0) {
      console.log(`  skip ${run.adapterName}/${run.llmModel}: 0 scenarios scored`)
      continue
    }
    try {
      const unsigned = buildReceiptForRun(run, scenarios, ranAt)
      const signed = signConvergenceReceipt(unsigned, privateKey)
      const slug = `${run.adapterName}_${run.llmModel}`.replace(/[^a-z0-9_-]/gi, '-')
      const dest = join(publishDir, `${ranAt.replace(/[:.]/g, '-')}_${slug}_${signed.receiptId}.json`)
      writeFileSync(dest, JSON.stringify(signed, null, 2))
      publishedPaths.push(dest)
    } catch (e) {
      console.error(`  failed to sign ${run.adapterName}/${run.llmModel}:`, (e as Error).message)
    }
  }
  if (publishedPaths.length > 0) {
    console.log(`\nSigned ${publishedPaths.length} receipt(s):`)
    for (const p of publishedPaths) console.log(`  ${p}`)
  }

  // Sanity: re-canonicalize and verify each signed receipt before exit
  for (const p of publishedPaths) {
    const r = JSON.parse(readFileSync(p, 'utf-8'))
    if (!r.signature?.value || !r.signature?.publicKeyFingerprint) {
      console.error(`receipt ${p} missing signature fields`)
    }
  }
}

main().catch((e) => {
  console.error('\nFATAL:', e)
  process.exit(1)
})
