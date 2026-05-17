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

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { BaselineAnthropicAdapter } from '../src/adapters/multiagent/baseline-anthropic.js'
import { AzureOpenAIBaselineAdapter } from '../src/adapters/multiagent/azure-openai-baseline.js'
import { loadAllConvergenceScenarios } from '../src/fixtures-convergence.js'
import { scoreScenario, aggregateConvergenceScores } from '../src/scoring/convergence.js'
import type {
  MultiAgentAdapter,
  PerScenarioConvergenceResult,
  ConvergenceScores,
} from '../src/types-convergence.js'

const N_AGENTS = 3
const N_ROUNDS = 3

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..')

interface AdapterRun {
  adapterName: string
  llmModel: string
  scores: ConvergenceScores
  perScenario: PerScenarioConvergenceResult[]
  errors: Array<{ scenarioId: string; message: string }>
  durationMs: number
}

async function runAdapter(
  adapter: MultiAgentAdapter,
  scenarios: Awaited<ReturnType<typeof loadAllConvergenceScenarios>>,
): Promise<AdapterRun> {
  const t0 = Date.now()
  const perScenario: PerScenarioConvergenceResult[] = []
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
    scores,
    perScenario,
    errors,
    durationMs: Date.now() - t0,
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
      runs.map((r) => r.llmModel.padStart(16)).join(' '),
  )
  console.log('├──────────────────────────────────────────────────────────────────────────────')
  const row = (label: string, key: keyof ConvergenceScores, fmt: (n: number) => string) => {
    console.log(
      '│ ' +
        label.padEnd(40) +
        runs.map((r) => fmt(r.scores[key]).padStart(16)).join(' '),
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

  // Write raw results to disk so we can replay / sign later
  const outDir = join(REPO_ROOT, 'results', 'preview')
  mkdirSync(outDir, { recursive: true })
  const outFile = join(
    outDir,
    `convergence-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`,
  )
  writeFileSync(
    outFile,
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
  console.log(`\nResults written to: ${outFile}`)
}

main().catch((e) => {
  console.error('\nFATAL:', e)
  process.exit(1)
})
