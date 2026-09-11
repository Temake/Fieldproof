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


def sync_conflicts(job_id: str, fresh: list[Conflict]) -> list[str]:
    """Fold a reconciliation pass into the conflict history.

    Conflicts that disappeared are CLEARED, and any decision still pending on
    one of them is withdrawn - a supervisor should never be asked about a
    problem that no longer exists. Returns the cleared conflict ids.
    """
    from domain.events import make_event
    from domain.reconciliation.engine import merge_conflicts
    from infra.settings import get_event_bus

    store = get_store()
    state = store.get_state(job_id)
    merged, cleared = merge_conflicts(state.conflicts, fresh, utcnow())
    store.set_conflicts(job_id, merged)

    for decision in state.pending_decisions():
        if decision.conflict_id not in cleared:
            continue
        decision.status = DecisionStatus.EXPIRED
        decision.resolved_at = utcnow()
        store.save_decision(decision)
        event = store.append_event(
            make_event(
                job_id,
                EventType.DECISION_RESOLVED,
                message=f"Decision withdrawn: new evidence cleared {decision.conflict_id}",
                decision_id=decision.id,
                conflict_id=decision.conflict_id,
                decision="EXPIRED",
            )
        )
        get_event_bus().publish(event)
    return cleared


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
    conflict = state.conflict_by_id(decision.conflict_id)
    if conflict is not None:
        conflict.resolution_decision_id = decision.id
        if action == DecisionAction.REQUEST_CLARIFICATION:
            # Not a resolution: the question goes to the technician and the
            # conflict keeps blocking closeout until someone decides (INV-001).
            conflict.status = ConflictStatus.AWAITING_CLARIFICATION
        else:
            conflict.status = (
                ConflictStatus.HUMAN_APPROVED
                if action == DecisionAction.APPROVE
                else ConflictStatus.HUMAN_REJECTED
            )
            conflict.resolved_at = utcnow()
        store.save_conflict(conflict)

    data = {
        "decision_id": decision.id,
        "conflict_id": decision.conflict_id,
        "decision": action.value,
        "decided_by": decided_by,
        "financial_impact": decision.financial_impact,
    }
    store.record_idempotent_result(key, data)

    verb = {
        DecisionAction.APPROVE: "Approved",
        DecisionAction.REJECT: "Rejected",
        DecisionAction.REQUEST_CLARIFICATION: "Clarification requested",
    }[action]
    event = store.append_event(
        make_event(
            decision.job_id,
            EventType.DECISION_RESOLVED,
            message=f"{verb} by {decided_by}",
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
        message=f"{verb} by {decided_by}",
    )


@fieldproof_tool(ActionType.REQUEST_CLARIFICATION, EventType.EVIDENCE_REQUESTED)
def request_technician_clarification(
    state, *, decision_id: str, message: str, **_: Any
) -> tuple[dict[str, Any], str]:
    """Relay a supervisor's question to the technician (PRD FR-11).

    Idempotent per decision, so a re-run while waiting never re-sends it.
    """
    from infra.settings import get_notifier

    recipient = state.job.technician_id
    message_id = get_notifier().send(recipient, message, job_id=state.job.id)
    return (
        {
            "decision_id": decision_id,
            "recipient": recipient,
            "message": message,
            "message_id": message_id,
        },
        f"Technician asked for clarification: {message}",
    )
