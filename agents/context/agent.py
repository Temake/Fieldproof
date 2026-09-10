"""Agent 1 - Context Agent (PRD 16).

Responsible for understanding the work order. It reads; it never writes.

Deliberately deterministic: the work order is already structured, so a model
call would add latency and risk without adding understanding. The agent exists
as a graph node so context loading is visible in the timeline like every other
step.
"""

from __future__ import annotations

from typing import Any

from tools.jobs import get_job_context

SYSTEM_PROMPT = """You are the Context Agent for FieldProof.

You load a work order and summarize what must be true before the job may close.
You never make claims about what happened in the field, and you never approve
anything. Output only:
  - requirements: what the work order demands
  - policies: which rules govern this job
  - allowed_actions: what the workflow may do next
"""


def load_context(job_id: str) -> dict[str, Any]:
    """Return requirements, policies and allowed actions for a job."""
    context = get_job_context(job_id)
    context["policies"] = _policies_for(context)
    context["allowed_actions"] = _allowed_actions(context)
    return context


def _policies_for(context: dict[str, Any]) -> list[dict[str, str]]:
    from domain.policies.rules import RULES

    return [
        {"id": rule.id, "description": rule.description, "outcome": rule.outcome.value}
        for rule in RULES.values()
    ]


def _allowed_actions(context: dict[str, Any]) -> list[str]:
    from domain.enums import ActionType

    return [a.value for a in ActionType]
