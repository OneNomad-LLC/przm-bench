/**
 * Onenomad Bench — multi-agent convergence benchmark types.
 *
 * Sibling to ./types.ts (which covers memory benchmarks). Kept in a
 * separate file because the surface is conceptually distinct: memory
 * adapters ingest+query single-call APIs; convergence adapters drive
 * multi-round multi-agent debates.
 *
 * Full methodology spec: ../METHODOLOGY-CONVERGENCE.md
 */

import { z } from 'zod'

// ── Scenario (the fixture surface) ─────────────────────────────────

export const ConfederateConfigSchema = z.object({
  /** Index (0-based) of the agent assigned to be the confederate. */
  agentIndex: z.number().int().nonnegative(),
  /** The wrong answer the confederate must defend in round 0. */
  assignedAnswer: z.string().min(1),
  /** Confidence-loaded rationale the confederate uses. */
  rationale: z.string().min(1).max(2_000),
})
export type ConfederateConfig = z.infer<typeof ConfederateConfigSchema>

export const ConvergenceScenarioSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  category: z.string().min(1),
  question: z.string().min(1).max(2_000),
  correctAnswer: z.string().min(1).max(500),
  /** Wrong-but-plausible answers. Used for both confederate selection
   *  and (eventually) for distractor-presence scoring. */
  distractors: z.array(z.string().min(1).max(500)).default([]),
  confederateConfig: ConfederateConfigSchema.optional(),
  notes: z.string().optional(),
  /** License attribution if scenario was sourced from external dataset. */
  source: z
    .object({
      url: z.string().url(),
      license: z.string(),
    })
    .optional(),
})
export type ConvergenceScenario = z.infer<typeof ConvergenceScenarioSchema>

export const ConvergenceFixtureSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  benchmark: z.literal('convergence'),
  description: z.string().min(10).max(500),
  scenarios: z.array(ConvergenceScenarioSchema).min(1),
  notes: z.string().optional(),
})
export type ConvergenceFixture = z.infer<typeof ConvergenceFixtureSchema>

// ── Transcript (what the adapter returns) ───────────────────────────

export const PerAgentRoundSchema = z.object({
  agentIndex: z.number().int().nonnegative(),
  /**
   * The agent's answer extracted to a normalized canonical form.
   * Adapter is responsible for the extraction (regex, structured
   * output, or framework-native tool calls). Whitespace/case
   * normalization is the adapter's responsibility too — by the time
   * scoring sees it, equality comparison should be meaningful.
   */
  answer: z.string(),
  /** Full raw text emitted by the agent this round. */
  message: z.string(),
  /** Output token count for this turn (for token-waste scoring). */
  outputTokens: z.number().int().nonnegative(),
})
export type PerAgentRound = z.infer<typeof PerAgentRoundSchema>

export const DebateRoundSchema = z.object({
  /** 0-indexed round number. */
  roundNumber: z.number().int().nonnegative(),
  perAgent: z.array(PerAgentRoundSchema).min(1),
})
export type DebateRound = z.infer<typeof DebateRoundSchema>

export const DebateTranscriptSchema = z.object({
  scenarioId: z.string(),
  rounds: z.array(DebateRoundSchema).min(1),
})
export type DebateTranscript = z.infer<typeof DebateTranscriptSchema>

// ── Adapter contract ────────────────────────────────────────────────

export interface MultiAgentAdapter {
  /** "crewai", "autogen", "langgraph", "claude-agents-sdk", "openai-swarm". */
  readonly name: string
  /** SemVer of the framework. */
  readonly version: string
  /** Exact LLM model used by all agents (e.g. "anthropic/claude-haiku-4-5"). */
  readonly llmModel: string

  /**
   * Run a debate scenario. Adapter responsibilities:
   * - Spawn N distinct agent instances.
   * - If scenario.confederateConfig is set, inject the confederate
   *   prompt for the designated agent in round 0.
   * - Drive nRounds of debate where each agent reads the prior round's
   *   messages from all peers.
   * - Extract per-agent per-round answers via the adapter's structured
   *   output parser (NOT free-text). Normalize for comparison.
   * - Return a complete DebateTranscript including raw messages and
   *   token counts.
   */
  runDebate(
    scenario: ConvergenceScenario,
    opts: { nAgents: number; nRounds: number },
  ): Promise<DebateTranscript>

  /** Wipe per-scenario state. Called between scenarios. */
  reset(): Promise<void>

  /** Optional teardown. */
  cleanup?(): Promise<void>
}

// ── Per-scenario + benchmark scores ────────────────────────────────

export interface PerScenarioConvergenceResult {
  scenarioId: string
  /** Most-frequent answer across agents in the FINAL round. Ties → null. */
  finalConsensus: string | null
  /** Did the final consensus match the scenario's correctAnswer? */
  correct: boolean
  /** Did the debate end with all agents on the same answer? */
  collapsed: boolean
  /** Did at least one non-confederate agent that started correct
   *  end on the confederate's wrong answer? (null if no confederate) */
  sycophancyOccurred: boolean | null
  /** Per-agent count of answer changes between consecutive rounds. */
  positionFlipsByAgent: number[]
  /** Sum of output tokens across all agents and rounds. */
  totalOutputTokens: number
}

export interface ConvergenceScores {
  /** Fraction of scenarios where consensus matched correctAnswer. */
  correct_final_answer_rate: number
  /** Fraction of scenarios that ended with a single shared answer. */
  collapse_rate: number
  /**
   * Fraction of (non-confederate agent × scenario) pairs where the
   * agent started correct and ended on the confederate's answer.
   * Only computed across scenarios that had a confederateConfig.
   */
  sycophancy_ratio: number
  /** Mean of `totalOutputTokens / 1` across CORRECT-only scenarios. */
  tokens_per_correct_answer: number
  /**
   * `total_position_flips / (n_agents * n_rounds * n_scenarios)`.
   * Descriptive, not prescriptive.
   */
  position_flips_per_agent_per_round: number
}

export const CONVERGENCE_SCORES_KEYS = [
  'correct_final_answer_rate',
  'collapse_rate',
  'sycophancy_ratio',
  'tokens_per_correct_answer',
  'position_flips_per_agent_per_round',
] as const
