"""Let a model drive the closeout through the Strands tool loop (PRD 18, 24).

The workflow never needs this - `run_workflow` closes jobs deterministically.
This script exists to show what the architecture buys: the same tools handed
to a model, with authorization still in the domain layer, so the interesting
case is the one where the model is *wrong* and the policy layer refuses it.

    python scripts/seed.py --reset
    python scripts/agentic_closeout.py JOB-1842

Needs Bedrock credentials and the agents extra:

    pip install -e ".[dev]"
    export FIELDPROOF_STUB_AGENTS=0

Every tool call is printed with the verdict the domain layer returned, so a
refusal is visible rather than buried in the transcript.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("job_id", nargs="?", default="JOB-1842")
    parser.add_argument(
        "--task",
        default=None,
        help="What to ask the agent to do (default: close out the job).",
    )
    args = parser.parse_args()

    from infra.settings import get_settings, get_store

    if get_settings().stub_agents:
        print(
            "FIELDPROOF_STUB_AGENTS is on, so there is no model to drive the tools.\n"
            "Set FIELDPROOF_STUB_AGENTS=0 and provide AWS credentials.",
            file=sys.stderr,
        )
        return 2

    try:
        state = get_store().get_state(args.job_id)
    except Exception as exc:  # noqa: BLE001 - a missing job is a user error, not a crash
        print(f"could not load {args.job_id}: {exc}", file=sys.stderr)
        print("seed one first:  python scripts/seed.py --reset", file=sys.stderr)
        return 2

    print(f"job     {state.job.id} - {state.job.description}")
    print(f"status  {state.job.status}")
    print(f"model   {get_settings().bedrock_model_id}\n")

    from agents.action.agent import build_tool_agent

    agent = build_tool_agent()
    task = args.task or (
        f"Close out {args.job_id}. Check what it still needs first, and do only "
        "what the tools permit."
    )
    result = agent(task)

    print("\n--- tool calls " + "-" * 45)
    for name, payload in _tool_calls(result):
        verdict = "ok" if payload.get("ok") else f"REFUSED: {payload.get('refused_reason')}"
        invariant = payload.get("invariant")
        line = f"  {name:32} {verdict}"
        if invariant:
            line += f"  [{invariant}]"
        print(line)

    print("\n--- final state " + "-" * 44)
    final = get_store().get_state(args.job_id)
    print(f"status  {final.job.status}")
    print(f"answer  {result}")
    return 0


def _tool_calls(result: Any) -> list[tuple[str, dict[str, Any]]]:
    """Pull (tool name, result payload) out of the agent's message history."""
    calls: list[tuple[str, dict[str, Any]]] = []
    names: dict[str, str] = {}
    for message in getattr(result, "messages", None) or []:
        for block in message.get("content", []):
            use = block.get("toolUse")
            if use:
                names[use.get("toolUseId", "")] = use.get("name", "?")
            got = block.get("toolResult")
            if got:
                calls.append(
                    (names.get(got.get("toolUseId", ""), "?"), _payload(got))
                )
    return calls


def _payload(tool_result: dict[str, Any]) -> dict[str, Any]:
    for block in tool_result.get("content", []):
        text = block.get("text") or block.get("json")
        if isinstance(text, dict):
            return text
        if isinstance(text, str):
            try:
                return json.loads(text)
            except ValueError:
                return {"ok": tool_result.get("status") != "error", "detail": text}
    return {"ok": tool_result.get("status") != "error"}


if __name__ == "__main__":
    raise SystemExit(main())
