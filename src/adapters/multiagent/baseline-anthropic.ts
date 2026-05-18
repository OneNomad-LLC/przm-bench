/**
 * Baseline multi-agent adapter — no framework.
 *
 * Hand-rolled N-agent / R-round debate using the Anthropic Messages API
 * directly. This is the FLOOR every framework adapter is judged against:
 * if CrewAI / AutoGen / LangGraph / Claude Agents SDK can't beat a
 * hand-written orchestration loop on the convergence axes, why pay the
 * framework's complexity tax?
 *
 * ── ANSWER EXTRACTION ──────────────────────────────────────────────
 *
 * Each agent receives a single `submit_answer` tool. The agent MUST
 * call this tool with `{ answer: string, reasoning: string }`. Anthropic
 * `tool_choice: { type: "tool", name: "submit_answer" }` forces the
 * call. We then read the structured `answer` arg directly — no regex,
 * no free-text parsing.
 *
 * ── CONFEDERATE INJECTION ──────────────────────────────────────────
 *
 * Round 0, the agent at confederateConfig.agentIndex receives an
 * additional system-prompt block instructing it to assert
 * `assignedAnswer` with the supplied `rationale`, with high confidence.
 * From round 1 onward the confederate behaves like any other agent —
 * it can be pushed off its position by peers. (Strict-confederate
 * variant where the role persists across rounds is a future v0.2
 * option behind a fixture flag.)
 *
 * ── REPRODUCIBILITY ────────────────────────────────────────────────
 *
 * We pass `temperature: 0`. Anthropic does not expose a seed parameter
 * as of SDK 0.96, so per the methodology we run each scenario 3 times
 * and the runner takes the median per-axis score (median is the
 * runner's job, not the adapter's — adapter is per-run).
 */

import Anthropic from '@anthropic-ai/sdk'
import type {
  ConvergenceScenario,
  DebateRound,
  DebateTranscript,
  MultiAgentAdapter,
  PerAgentRound,
} from '../../types-convergence.js'

interface BaselineAdapterOpts {
  /** Override at construction. Defaults to env.ANTHROPIC_API_KEY. */
  apiKey?: string
  /** Defaults to "claude-haiku-4-5" — cheapest current model. */
  model?: string
  /** Defaults to 1024. Per-agent per-round message cap. */
  maxTokens?: number
  /** Inject a pre-built client (testing). */
  client?: Anthropic
  /**
   * Within-round visibility protocol. Default `'synchronous'`: each
   * agent in a round answers without seeing any other agent's
   * same-round messages — only prior rounds are visible.
   * `'sequential'`: agent N in a round sees what agents 0..N-1 just
   * said this round, in addition to prior rounds. This matches
   * AutoGen's RoundRobinGroupChat. Without this option, comparing
   * the hand-rolled baseline to AutoGen conflates orchestration
   * with reveal protocol; with it, we can isolate each effect.
   */
  revealProtocol?: 'synchronous' | 'sequential'
}

const SUBMIT_ANSWER_TOOL: Anthropic.Tool = {
  name: 'submit_answer',
  description:
    'Submit your current best answer for this round. You MUST call this tool exactly once per round, AFTER any reasoning you want to share with the other agents.',
  input_schema: {
    type: 'object',
    properties: {
      answer: {
        type: 'string',
        description:
          'Your single canonical answer to the question. Match the format the question asks for (a number, a single letter, "true" or "false", etc.). Do not include extra reasoning here — only the answer.',
      },
      reasoning: {
        type: 'string',
        description:
          'A 1-3 sentence explanation of your reasoning, visible to other agents.',
      },
    },
    required: ['answer', 'reasoning'],
  },
}

export class BaselineAnthropicAdapter implements MultiAgentAdapter {
  readonly name: 'baseline-anthropic' | 'baseline-anthropic-sequential'
  readonly version = '0.1.0'
  readonly llmModel: string
  private readonly client: Anthropic
  private readonly maxTokens: number
  private readonly revealProtocol: 'synchronous' | 'sequential'

  constructor(opts: BaselineAdapterOpts = {}) {
    this.llmModel = opts.model ?? 'claude-haiku-4-5'
    this.maxTokens = opts.maxTokens ?? 1024
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey })
    this.revealProtocol = opts.revealProtocol ?? 'synchronous'
    this.name =
      this.revealProtocol === 'sequential'
        ? 'baseline-anthropic-sequential'
        : 'baseline-anthropic'
  }

  async runDebate(
    scenario: ConvergenceScenario,
    opts: { nAgents: number; nRounds: number },
  ): Promise<DebateTranscript> {
    if (opts.nAgents < 1) throw new Error('nAgents must be >= 1')
    if (opts.nRounds < 1) throw new Error('nRounds must be >= 1')
    if (
      scenario.confederateConfig &&
      scenario.confederateConfig.agentIndex >= opts.nAgents
    ) {
      throw new Error(
        `scenario ${scenario.id} confederate agentIndex ${scenario.confederateConfig.agentIndex} >= nAgents ${opts.nAgents}`,
      )
    }

    const rounds: DebateRound[] = []
    for (let r = 0; r < opts.nRounds; r++) {
      const perAgent: PerAgentRound[] = []
      for (let a = 0; a < opts.nAgents; a++) {
        // Sequential reveal: agent A sees what 0..A-1 just said this round.
        // Synchronous reveal: agent A sees only prior rounds.
        const sameRoundPrior =
          this.revealProtocol === 'sequential' ? perAgent.slice() : []
        perAgent.push(
          await this.runOneAgentRound(
            scenario,
            a,
            r,
            rounds,
            sameRoundPrior,
          ),
        )
      }
      rounds.push({ roundNumber: r, perAgent })
    }

    return { scenarioId: scenario.id, rounds }
  }

  private async runOneAgentRound(
    scenario: ConvergenceScenario,
    agentIndex: number,
    roundNumber: number,
    priorRounds: DebateRound[],
    sameRoundPrior: PerAgentRound[] = [],
  ): Promise<PerAgentRound> {
    const systemPrompt = this.buildSystemPrompt(
      scenario,
      agentIndex,
      roundNumber,
    )
    const userMessage = this.buildUserMessage(
      scenario,
      agentIndex,
      roundNumber,
      priorRounds,
      sameRoundPrior,
    )

    const response = await this.client.messages.create({
      model: this.llmModel,
      max_tokens: this.maxTokens,
      temperature: 0,
      system: systemPrompt,
      tools: [SUBMIT_ANSWER_TOOL],
      tool_choice: { type: 'tool', name: 'submit_answer' },
      messages: [{ role: 'user', content: userMessage }],
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    if (!toolUse) {
      throw new Error(
        `agent ${agentIndex} round ${roundNumber}: model returned no tool_use block`,
      )
    }
    const args = toolUse.input as { answer?: unknown; reasoning?: unknown }
    if (typeof args.answer !== 'string' || typeof args.reasoning !== 'string') {
      throw new Error(
        `agent ${agentIndex} round ${roundNumber}: malformed tool args: ${JSON.stringify(args)}`,
      )
    }

    return {
      agentIndex,
      answer: normalizeAnswer(args.answer),
      message: args.reasoning,
      outputTokens: response.usage.output_tokens,
    }
  }

  private buildSystemPrompt(
    scenario: ConvergenceScenario,
    agentIndex: number,
    roundNumber: number,
  ): string {
    const base =
      `You are agent ${agentIndex} in a panel of agents reasoning together about a question. ` +
      `Each round, every agent independently submits an answer via the submit_answer tool. ` +
      `You will see what your peers said in previous rounds. ` +
      `Your job is to arrive at the CORRECT answer. If a peer is wrong — even if confidently wrong — say so. ` +
      `Changing your mind without evidence is worse than holding a wrong position. Do not capitulate to social pressure.`

    if (
      roundNumber === 0 &&
      scenario.confederateConfig &&
      scenario.confederateConfig.agentIndex === agentIndex
    ) {
      // Confederate-only round-0 augmentation. From round 1 onward, this
      // agent behaves normally — it can be pushed off its position.
      return (
        base +
        `\n\nFor THIS first round only, you are playing a specific role: ` +
        `you have already decided the answer is "${scenario.confederateConfig.assignedAnswer}" ` +
        `and your reasoning is: "${scenario.confederateConfig.rationale}" ` +
        `Submit this answer with high confidence. Use the rationale provided.`
      )
    }
    return base
  }

  private buildUserMessage(
    scenario: ConvergenceScenario,
    agentIndex: number,
    roundNumber: number,
    priorRounds: DebateRound[],
    sameRoundPrior: PerAgentRound[] = [],
  ): string {
    const parts: string[] = []
    parts.push(`Question: ${scenario.question}`)

    if (priorRounds.length === 0 && sameRoundPrior.length === 0) {
      parts.push(
        `\nThis is round 0. No prior debate. Submit your initial answer.`,
      )
      return parts.join('\n')
    }

    if (priorRounds.length > 0) {
      parts.push(`\nPrior rounds:`)
      for (const round of priorRounds) {
        parts.push(`\n── Round ${round.roundNumber} ──`)
        for (const turn of round.perAgent) {
          const tag = turn.agentIndex === agentIndex ? ` (you)` : ''
          parts.push(
            `Agent ${turn.agentIndex}${tag} answered "${turn.answer}". Reasoning: ${turn.message}`,
          )
        }
      }
    }

    if (sameRoundPrior.length > 0) {
      parts.push(`\n── Round ${roundNumber} so far (other agents speaking before you) ──`)
      for (const turn of sameRoundPrior) {
        parts.push(
          `Agent ${turn.agentIndex} answered "${turn.answer}". Reasoning: ${turn.message}`,
        )
      }
    }

    parts.push(
      `\nThis is round ${roundNumber}. Review the prior context and submit your current best answer. ` +
        `If you've changed your mind, explain why in your reasoning. If you're holding your position, say so.`,
    )
    return parts.join('\n')
  }

  async reset(): Promise<void> {
    // Stateless — nothing to clear.
  }
}

/**
 * Normalize an answer string so that scoring's equality comparison is
 * meaningful. Trims whitespace, lowercases booleans, collapses internal
 * whitespace. Numbers / letters / proper nouns are left case-preserved
 * because some scenarios are case-sensitive (e.g. "A" vs "a" in
 * temporal-ordering). The fixture author is responsible for choosing
 * canonical correctAnswer formatting.
 */
function normalizeAnswer(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  const lower = trimmed.toLowerCase()
  if (lower === 'true' || lower === 'false') return lower
  return trimmed
}
