"""Conflict and human-decision tools (PRD 24, FR-10, FR-11, FR-12)."""

from __future__ import annotations

from typing import Any

from domain.enums import (
    ActionType,
    ConflictSeverity,
    ConflictStatus,
    ConflictType,
    DecisionAction,
    DecisionStatus,
    EventType,
)
from domain.ids import utcnow
from domain.models import Conflict, Decision
from infra.settings import get_store
from tools.base import ToolResult, fieldproof_tool


def sync_conflicts(job_id: str, conflicts: list[Conflict]) -> None:
    """Replace the open conflict set after a reconciliation pass."""
    get_store().replace_conflicts(job_id, conflicts)


@fieldproof_tool(ActionType.CREATE_CONFLICT, EventType.CONFLICT_DETECTED)
def create_conflict(
    state,
    *,
    type: ConflictType,
    severity: ConflictSeverity,
    description: str,
    requirement_id: str | None = None,
    financial_impact: float = 0.0,
    evidence_ids: list[str] | None = None,
    claim_ids: list[str] | None = None,
    policy_id: str | None = None,
    **_: Any,
) -> tuple[dict[str, Any], str]:
    conflict = Conflict(
        job_id=state.job.id,
        type=type,
        severity=severity,
        description=description,
        requirement_id=requirement_id,
        financial_impact=financial_impact,
        evidence_ids=evidence_ids or [],
        claim_ids=claim_ids or [],
        policy_id=policy_id,
    )
    get_store().save_conflict(conflict)
    return (
        {"conflict_id": conflict.id, "type": type.value, "severity": severity.value},
        f"{severity.value} conflict detected: {description}",
    )


@fieldproof_tool(ActionType.CREATE_DECISION, EventType.DECISION_REQUESTED)
def request_human_decision(
    state,
    *,
    conflict_id: str,
    question: str,
    recommended_action: DecisionAction,
    policy: str,
    policy_id: str | None = None,
    financial_impact: float = 0.0,
    evidence_ids: list[str] | None = None,
    requested_from: str = "supervisor",
    **_: Any,
) -> tuple[dict[str, Any], str]:
    """PRD FR-10 - a decision request must carry its own justification.

    Authorization refuses a second pending decision for the same conflict, so a
    retried event cannot double-ask a supervisor (INV-006).
    """
    decision = Decision(
        job_id=state.job.id,
        conflict_id=conflict_id,
        question=question,
        recommended_action=recommended_action,
        policy=policy,
        policy_id=policy_id,
        financial_impact=financial_impact,
        evidence_ids=evidence_ids or [],
        requested_from=requested_from,
    )
    get_store().add_decision(decision)
    return (
        {
            "decision_id": decision.id,
            "conflict_id": conflict_id,
            "question": question,
            "recommended_action": recommended_action.value,
            "financial_impact": financial_impact,
        },
        f"Supervisor approval requested: {question}",
    )


def resolve_decision(
    decision_id: str,
    action: DecisionAction,
    *,
    decided_by: str,
    comment: str | None = None,
) -> ToolResult:
    """Record a human resolution and unblock the workflow (FR-11, FR-12).

    Resolution is idempotent: a second POST for the same decision returns the
    original outcome rather than resuming the workflow twice (INV-006).
    """
    from domain.events import idempotency_key, make_event
    from infra.settings import get_event_bus

    store = get_store()
    decision = store.get_decision(decision_id)
    if decision is None:
        return ToolResult(
            ok=False,
            action="resolve_decision",
            job_id="",
            message=f"unknown decision {decision_id}",
        )

    key = idempotency_key("resolve_decision", decision.job_id, decision_id)
    is_new, previous = store.claim_idempotency_key(key)
    if not is_new or decision.status != DecisionStatus.PENDING:
        return ToolResult(
            ok=True,
            action="resolve_decision",
            job_id=decision.job_id,
            data=previous or {"decision_id": decision_id, "decision": str(decision.decision)},
            message="decision already resolved",
            duplicate=True,
        )

    decision.status = DecisionStatus.RESOLVED
    decision.decision = action
    decision.decided_by = decided_by
    decision.comment = comment
    decision.resolved_at = utcnow()
    store.save_decision(decision)

    state = store.get_state(decision.job_id)
    for conflict in state.conflicts:
        if conflict.id != decision.conflict_id:
            continue
        conflict.status = (
            ConflictStatus.HUMAN_APPROVED
            if action == DecisionAction.APPROVE
            else ConflictStatus.HUMAN_REJECTED
        )
        conflict.resolved_at = utcnow()
        conflict.resolution_decision_id = decision.id
        store.save_conflict(conflict)

    data = {
        "decision_id": decision.id,
        "conflict_id": decision.conflict_id,
        "decision": action.value,
        "decided_by": decided_by,
        "financial_impact": decision.financial_impact,
    }
    store.record_idempotent_result(key, data)

    event = store.append_event(
        make_event(
            decision.job_id,
            EventType.DECISION_RESOLVED,
            message=f"{action.value.title()} by {decided_by}",
            actor=decided_by,
            idempotency_key=key,
            **data,
        )
    )
    get_event_bus().publish(event)
    return ToolResult(
        ok=True,
        action="resolve_decision",
        job_id=decision.job_id,
        data=data,
        message=f"{action.value.title()} by {decided_by}",
    )
