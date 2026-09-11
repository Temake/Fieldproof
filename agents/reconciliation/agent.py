"""Agent 3 - Reconciliation Agent (PRD 16).

Compares requirements vs claims vs evidence and produces verified
requirements, missing requirements, conflicts and confidence.

The comparison itself is deterministic (domain/reconciliation/engine.py). The
model's only job is to write the human-readable explanation that appears on the
decision card and the receipt - it cannot change a status.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from domain.models import JobState
from domain.reconciliation.engine import ReconciliationResult, reconcile

SYSTEM_PROMPT = """You are the Reconciliation Agent for FieldProof.

You are given a completed comparison between what a work order required, what
was claimed, and what the evidence shows. You do not change any status.

Write one short paragraph a busy operations supervisor can read in five
seconds: what is verified, what is missing, and what does not line up. Name the
specific evidence. Never speculate beyond the comparison you were given.
"""


def run(state: JobState) -> ReconciliationResult:
    """Deterministic reconciliation pass."""
    return reconcile(state)


class Summary(BaseModel):
    summary: str = Field(description="One short paragraph for a supervisor")


def explain(state: JobState, result: ReconciliationResult) -> str:
    """Narrative summary of a reconciliation result. Template if the model is unavailable."""
    from agents.runtime import build_agent, stub_mode

    fallback = _explain_stub(result)
    if stub_mode():
        return fallback
    facts = "\n".join(
        f"- {r.description}: {r.status.value}" + (f" ({r.notes})" if r.notes else "")
        for r in result.requirements
    ) + "\n" + "\n".join(f"- conflict: {c.description}" for c in result.conflicts)
    try:
        out = build_agent("reconciliation", SYSTEM_PROMPT)(
            f"Job {state.job.id}: {state.job.description}\n{facts}",
            structured_output_model=Summary,
        )
        return out.structured_output.summary.strip() or fallback
    except Exception:  # noqa: BLE001 - a summary is never worth failing a run
        return fallback


def _explain_stub(result: ReconciliationResult) -> str:
    verified = sum(1 for r in result.requirements if r.status.value == "VERIFIED")
    total = len(result.requirements)
    parts = [f"{verified}/{total} requirements verified"]
    if result.missing_requirement_ids:
        parts.append(f"{len(result.missing_requirement_ids)} still unsupported")
    if result.conflicts:
        parts.append(f"{len(result.conflicts)} conflicts detected")
    return "; ".join(parts) + "."
