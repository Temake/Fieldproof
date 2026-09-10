"""Agent 5 - Action Agent (PRD 16).

Performs permitted external actions. Every function here delegates to a tool in
tools/, and every tool passes through domain/authorization before it executes.

    LLM proposes. Policy layer authorizes. Tool executes.  (PRD 18)
"""

from __future__ import annotations

from typing import Any

from domain.enums import ConflictType, JobStatus
from domain.models import Conflict, JobState
from tools.decisions import create_conflict, request_human_decision
from tools.evidence import request_technician_evidence
from tools.jobs import close_job, set_job_status
from tools.reports import generate_closeout_report, prepare_invoice

SYSTEM_PROMPT = """You are the Action Agent for FieldProof.

You execute the actions the workflow has already decided on. You have no
authority of your own: every tool you call is authorized independently, and a
refusal is final. Never retry a refused action with different arguments to get
around it. Never claim an action succeeded unless the tool said so.
"""


def request_evidence(state: JobState, requirement_ids: list[str], message: str):
    """PRD FR-08 / G4 - recover missing information before escalating."""
    return request_technician_evidence(
        state.job.id, requirement_ids=list(requirement_ids), message=message
    )


def open_conflict(state: JobState, conflict: Conflict):
    return create_conflict(
        state.job.id,
        type=conflict.type,
        severity=conflict.severity,
        description=conflict.description,
        requirement_id=conflict.requirement_id,
        financial_impact=conflict.financial_impact,
        evidence_ids=conflict.evidence_ids,
        claim_ids=conflict.claim_ids,
        policy_id=conflict.policy_id,
    )


def escalate(state: JobState, verdict, evidence_ids: list[str] | None = None):
    """PRD FR-10 - create the decision a supervisor will act on."""
    return request_human_decision(
        state.job.id,
        conflict_id=verdict.conflict_id,
        question=verdict.question,
        recommended_action=verdict.recommended_action,
        policy=verdict.rule.description,
        policy_id=verdict.rule.id,
        financial_impact=verdict.financial_impact,
        evidence_ids=evidence_ids or [],
    )


def finalize(state: JobState) -> dict[str, Any]:
    """PRD 12 scene 8 - report, invoice, close. Order matters for the timeline."""
    results = {
        "report": generate_closeout_report(state.job.id),
        "invoice": prepare_invoice(state.job.id),
    }
    set_job_status(state.job.id, JobStatus.CLOSING)
    results["close"] = close_job(state.job.id)
    return results


def message_for_missing(requirements, technician_name: str | None, conflicts=None) -> str:
    """The technician-facing sentence in PRD 11.

    Specific beats polite: name the exact artifact, so the technician can act
    without opening the app to work out what is meant.
    """
    if not isinstance(requirements, list):
        requirements = [requirements]
        conflicts = [conflicts]
    conflicts = list(conflicts or [None] * len(requirements))

    name = technician_name or "there"
    asks = []
    for requirement, conflict in zip(requirements, conflicts):
        ask = _ask_for(requirement, conflict)
        if ask not in asks:
            asks.append(ask)
    job_id = requirements[0].job_id
    return f"Hi {name}. I need {_join(asks)} before I can complete Job {job_id}."


def _join(items: list[str]) -> str:
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + f" and {items[-1]}"


def _ask_for(requirement, conflict) -> str:
    if conflict is not None and conflict.type == ConflictType.UNSUPPORTED_COMPLETION_CLAIM:
        expected = conflict.expected_value
        observed = conflict.observed_value
        if isinstance(expected, int) and isinstance(observed, int) and expected > observed:
            nth = _ordinal(observed + 1)
            part = requirement.part_number or "unit"
            return f"one additional photo showing the {nth} installed {part}"
    if conflict is not None and conflict.type == ConflictType.LOW_CONFIDENCE_EVIDENCE:
        return f"a clearer photo for: {requirement.description.lower()}"
    return requirement.description.lower()


def _ordinal(n: int) -> str:
    names = {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth"}
    return names.get(n, f"{n}th")
