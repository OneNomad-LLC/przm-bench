# autogen-runner

A Python subprocess wrapped by [`../autogen.ts`](../autogen.ts) so the TS
bench harness can drive a debate through Microsoft AutoGen
(`autogen-agentchat`) without us re-implementing AutoGen's orchestration
semantics in TypeScript.

## Why a subprocess

AutoGen is Python-only. The bench is Node + TypeScript. The cleanest
interop is a one-shot subprocess invocation per scenario: input scenario
JSON in, debate transcript JSON out, no long-running state.

## Setup (one-time)

```powershell
cd src/adapters/multiagent/autogen-runner
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Tested with Python 3.11+ and AutoGen 0.7.x. The pinned versions in
`requirements.txt` are what receipts will be tagged with.

## Calling convention

```
python run_debate.py --in scenario.json --out transcript.json
```

Where `scenario.json` is:

```json
{
  "scenario": {
    "id": "...", "category": "...", "question": "...",
    "correctAnswer": "...", "distractors": [...],
    "confederateConfig": { "agentIndex": 0, "assignedAnswer": "...", "rationale": "..." }
  },
  "nAgents": 3,
  "nRounds": 3,
  "provider": "openai-azure",
  "providerConfig": {
    "endpoint": "https://...openai.azure.com/",
    "apiKey": "...",
    "apiVersion": "2024-12-01-preview",
    "deploymentName": "gpt-4o-mini"
  },
  "llmModel": "gpt-4o-mini"
}
```

Exit 0 + transcript JSON in `--out` path = success. Non-zero exit + error
on stderr = failure (the TS adapter surfaces this).

## What we're actually measuring

`RoundRobinGroupChat` is AutoGen's stock "everyone speaks in turn"
orchestration — agent 0 speaks, then agent 1 sees agent 0's message,
then agent 2 sees both. This is DIFFERENT from the baseline adapter's
synchronous-round semantics where each agent in round N sees only the
prior round's output, not their peers' same-round messages.

That difference is the point. AutoGen's native pattern creates an
information cascade: later agents in a round have strictly more peer
context than earlier ones, which is the canonical setup for sycophancy
to compound. The bench measures whether that's true in practice.
