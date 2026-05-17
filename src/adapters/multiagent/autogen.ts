/**
 * AutoGen multi-agent adapter.
 *
 * Spawns autogen-runner/run_debate.py per scenario, feeds it the
 * scenario JSON + provider config, parses the returned transcript.
 *
 * The actual orchestration is Microsoft AutoGen's RoundRobinGroupChat
 * — sequential within a round (agent N sees the prior agents' turns).
 * This is intentionally different from the baseline adapter's
 * synchronous-round semantics; that difference is the central thing
 * the bench is supposed to measure.
 *
 * See autogen-runner/README.md for the calling convention and venv
 * setup.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ConvergenceScenario,
  DebateTranscript,
  MultiAgentAdapter,
} from '../../types-convergence.js'

type Provider = 'openai-azure' | 'anthropic'

interface OpenAIAzureProviderConfig {
  endpoint: string
  apiKey: string
  apiVersion?: string
  deploymentName: string
}

interface AnthropicProviderConfig {
  apiKey: string
  model: string
}

type ProviderConfig =
  | { provider: 'openai-azure'; config: OpenAIAzureProviderConfig }
  | { provider: 'anthropic'; config: AnthropicProviderConfig }

interface AutoGenAdapterOpts {
  /** Underlying LLM identifier reported in receipts. */
  llmModel: string
  /** Provider + config the AutoGen runner will use for every agent. */
  provider: ProviderConfig
  /** Path to the venv's python binary. Defaults to
   *  `<runner-dir>/.venv/Scripts/python.exe` (Windows) or
   *  `<runner-dir>/.venv/bin/python` (POSIX). */
  pythonPath?: string
  /** Per-scenario timeout in ms. Default 600000 (10 min). */
  timeoutMs?: number
}

const HERE = dirname(fileURLToPath(import.meta.url))
const RUNNER_DIR = resolve(HERE, 'autogen-runner')
const RUNNER_SCRIPT = join(RUNNER_DIR, 'run_debate.py')

function defaultPythonPath(): string {
  const winPath = join(RUNNER_DIR, '.venv', 'Scripts', 'python.exe')
  if (existsSync(winPath)) return winPath
  const posixPath = join(RUNNER_DIR, '.venv', 'bin', 'python')
  if (existsSync(posixPath)) return posixPath
  // Fallback to PATH-resolved `python` — most likely to fail with a clear
  // error pointing at the venv setup instructions.
  return 'python'
}

export class AutoGenAdapter implements MultiAgentAdapter {
  readonly name = 'autogen'
  readonly version = '0.7.4'
  readonly llmModel: string
  private readonly provider: ProviderConfig
  private readonly pythonPath: string
  private readonly timeoutMs: number

  constructor(opts: AutoGenAdapterOpts) {
    this.llmModel = opts.llmModel
    this.provider = opts.provider
    this.pythonPath = opts.pythonPath ?? defaultPythonPath()
    this.timeoutMs = opts.timeoutMs ?? 600_000
  }

  async runDebate(
    scenario: ConvergenceScenario,
    opts: { nAgents: number; nRounds: number },
  ): Promise<DebateTranscript> {
    if (!existsSync(RUNNER_SCRIPT)) {
      throw new Error(`autogen-runner script not found at ${RUNNER_SCRIPT}`)
    }

    const work = mkdtempSync(join(tmpdir(), 'autogen-debate-'))
    const inPath = join(work, 'in.json')
    const outPath = join(work, 'out.json')

    const payload = {
      scenario,
      nAgents: opts.nAgents,
      nRounds: opts.nRounds,
      provider: this.provider.provider,
      providerConfig: this.provider.config,
      llmModel: this.llmModel,
    }
    writeFileSync(inPath, JSON.stringify(payload))

    try {
      await this.spawnRunner(inPath, outPath)
      const raw = readFileSync(outPath, 'utf-8')
      const transcript = JSON.parse(raw) as DebateTranscript
      this.validateTranscriptShape(transcript, scenario, opts)
      return transcript
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  }

  private async spawnRunner(inPath: string, outPath: string): Promise<void> {
    return new Promise((resolveP, rejectP) => {
      const child = spawn(
        this.pythonPath,
        [RUNNER_SCRIPT, '--in', inPath, '--out', outPath],
        {
          cwd: RUNNER_DIR,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
        },
      )

      let stderr = ''
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        rejectP(
          new Error(
            `autogen-runner timed out after ${this.timeoutMs}ms\nstderr: ${stderr.slice(-2000)}`,
          ),
        )
      }, this.timeoutMs)

      child.on('error', (err) => {
        clearTimeout(timer)
        rejectP(
          new Error(
            `autogen-runner spawn failed: ${err.message}\n` +
              `Python path: ${this.pythonPath}\n` +
              `Did you set up the venv? See autogen-runner/README.md`,
          ),
        )
      })

      child.on('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) {
          resolveP()
        } else {
          rejectP(
            new Error(
              `autogen-runner exited with code ${code}\nstderr: ${stderr.slice(-2000)}`,
            ),
          )
        }
      })
    })
  }

  private validateTranscriptShape(
    transcript: DebateTranscript,
    scenario: ConvergenceScenario,
    opts: { nAgents: number; nRounds: number },
  ): void {
    if (transcript.scenarioId !== scenario.id) {
      throw new Error(
        `autogen returned scenarioId ${transcript.scenarioId}, expected ${scenario.id}`,
      )
    }
    if (transcript.rounds.length === 0) {
      throw new Error('autogen returned zero rounds')
    }
    if (transcript.rounds.length > opts.nRounds) {
      throw new Error(
        `autogen returned ${transcript.rounds.length} rounds, expected at most ${opts.nRounds}`,
      )
    }
    for (const round of transcript.rounds) {
      if (round.perAgent.length === 0) {
        throw new Error(`round ${round.roundNumber} has no agent turns`)
      }
    }
  }

  async reset(): Promise<void> {
    // Subprocess is one-shot per scenario; nothing to reset between scenarios.
  }
}
