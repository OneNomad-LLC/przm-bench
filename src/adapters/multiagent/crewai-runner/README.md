# crewai-runner

A Python subprocess wrapped by [`../crewai.ts`](../crewai.ts) so the TS
bench harness can drive a debate through CrewAI (`crewai` ≥ 0.86)
without re-implementing CrewAI's task orchestration in TypeScript.

## Why a subprocess

CrewAI is Python-only. The bench is Node + TypeScript. One-shot
subprocess per scenario: input scenario JSON in, debate transcript
JSON out. No long-running state.

## Setup (one-time)

```powershell
cd src/adapters/multiagent/crewai-runner
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Tested with Python 3.13 and CrewAI 0.130.x. The pinned ranges in
`requirements.txt` are what receipts will be tagged with.

## Calling convention

```
python run_debate.py --in scenario.json --out transcript.json
```

`scenario.json` shape — identical to `autogen-runner` — see
[`../autogen-runner/README.md`](../autogen-runner/README.md) for the
fields. Output also matches the AutoGen runner: the same
`{scenarioId, rounds[].perAgent[]}` shape that the scoring pipeline
already consumes.

Exit 0 + transcript JSON at `--out` path = success.
Non-zero exit + traceback on stderr = failure (the TS adapter surfaces
this).

## What we're actually measuring

CrewAI's `Crew(process=Process.sequential)` runs tasks one at a time.
Each task carries an explicit `context=[...all prior tasks]`. So
agent_i in round_r sees **every** prior agent's output across all
prior rounds and all earlier tasks in the current round.

That is CrewAI's natural "sequential with full context" pattern and
is distinct from both:

- **baseline** — synchronous rounds; agent_i in round_r sees only the
  prior round's complete output set, not its same-round peers.
- **autogen** — RoundRobinGroupChat; each agent sees the messages
  emitted so far in the current chat, but framing is "chat history"
  rather than "task context."

Different orchestration → different convergence dynamics. The bench
records which approach holds up under confederate pressure.

## Structured output

Each task forces a Pydantic-typed output:

```python
class AnswerOutput(BaseModel):
    answer: str
    reasoning: str
```

CrewAI passes this through LiteLLM's function-calling adapter so the
underlying LLM is given a tool schema. Result: deterministic answer
extraction with no free-text parsing.

## Confederate injection

The confederate agent's round-0 task gets a special description that
asserts the wrong answer with the supplied rationale. From round 1
onward the confederate runs the normal task description and may be
convinced by peers (or persist; both are valid signals).
