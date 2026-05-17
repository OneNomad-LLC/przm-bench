/**
 * Claude Agents SDK adapter — STUB.
 *
 * The @anthropic-ai/claude-agent-sdk is Anthropic's official framework
 * for building tool-using agents. This stub exists so the convergence
 * runner can list the adapter as "supported (pending implementation)"
 * without crashing at import time.
 *
 * TODO(v0.2): Wire up @anthropic-ai/claude-agent-sdk's SubagentTool to
 * spawn N agent instances. Each round, fan out via the SDK's parallel
 * tool-call mechanism; collect structured outputs via the same
 * submit_answer schema used by the baseline. Inject confederate via
 * the sdk's per-subagent system-prompt override.
 *
 * For v0.1, the published leaderboard runs the baseline adapter only.
 * Framework adapters land in v0.2.
 */

import type {
  ConvergenceScenario,
  DebateTranscript,
  MultiAgentAdapter,
} from '../../types-convergence.js'

export class ClaudeAgentsSdkAdapter implements MultiAgentAdapter {
  readonly name = 'claude-agents-sdk'
  readonly version = '0.0.0-stub'
  readonly llmModel: string

  constructor(opts: { model?: string } = {}) {
    this.llmModel = opts.model ?? 'claude-haiku-4-5'
  }

  async runDebate(
    _scenario: ConvergenceScenario,
    _opts: { nAgents: number; nRounds: number },
  ): Promise<DebateTranscript> {
    throw new Error(
      'ClaudeAgentsSdkAdapter is a stub — full implementation lands v0.2. ' +
        'For v0.1, use BaselineAnthropicAdapter.',
    )
  }

  async reset(): Promise<void> {}
}
