"""Deterministic safety boundary (PRD 18).

    LLM proposes. Policy layer authorizes. Tool executes.

Every side-effecting tool calls authorize() before it does anything. No agent
output can reach an external system without passing through this function, and
this function never consults a model.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..enums import (
    ActionType,
    ConflictSeverity,
    ConflictStatus,
    DecisionAction,
    DecisionStatus,
    JobStatus,
    RequirementStatus,
)
from ..models import JobState


@dataclass(frozen=True)
class Authorization:
    allowed: bool
    reason: str
    invariant: str | None = None

    def __bool__(self) -> bool:
        return self.allowed


class NotAuthorized(Exception):
    def __init__(self, action: ActionType, auth: Authorization) -> None:
        super().__init__(f"{action.value} refused: {auth.reason}")
        self.action = action
        self.authorization = auth


ALLOW = Authorization(True, "allowed")


def authorize(action: ActionType, state: JobState, **context: object) -> Authorization:
    """Return whether this action may execute against this job state."""
    checker = _CHECKS.get(action)
    if checker is None:
        return Authorization(False, f"no authorization rule for {action.value}")
    if state.job.status == JobStatus.CLOSED and action != ActionType.GENERATE_REPORT:
        return Authorization(
            False, "job is already closed; no further actions may execute", "INV-001"
        )
    return checker(state, context)


def require(action: ActionType, state: JobState, **context: object) -> None:
    """authorize() but raises. Tools use this form."""
    auth = authorize(action, state, **context)
    if not auth.allowed:
        raise NotAuthorized(action, auth)


def _close_job(state: JobState, context: dict) -> Authorization:
    """INV-001 and INV-002 - the core product invariant (PRD 7)."""
    if state.blocking_conflicts():
        ids = ", ".join(c.id for c in state.blocking_conflicts())
        return Authorization(
            False, f"unresolved blocking conflicts: {ids}", "INV-001"
        )
    unverified = [
        r.id
        for r in state.required_requirements()
        if r.status != RequirementStatus.VERIFIED
    ]
    if unverified:
        return Authorization(
            False,
            f"required requirements not verified: {', '.join(unverified)}",
            "INV-002",
        )
    if state.pending_decisions():
        ids = ", ".join(d.id for d in state.pending_decisions())
        return Authorization(False, f"decisions still pending: {ids}", "INV-001")
    if state.job.status not in (JobStatus.VERIFIED, JobStatus.CLOSING):
        return Authorization(
            False, f"job must be VERIFIED to close, is {state.job.status.value}", "INV-001"
        )
    return ALLOW


def _increase_invoice(state: JobState, context: dict) -> Authorization:
    """INV-004 - financial exceptions need explicit human authorization."""
    amount = float(context.get("amount") or 0.0)
    if amount <= state.job.max_additional_spend_without_approval:
        return ALLOW
    approved = [
        d
        for d in state.decisions
        if d.status == DecisionStatus.RESOLVED
        and d.decision == DecisionAction.APPROVE
        and d.financial_impact + 1e-9 >= amount
    ]
    if not approved:
        return Authorization(
            False,
            f"increase of {amount:.2f} exceeds the {state.job.max_additional_spend_without_approval:.2f} "
            "allowance and has no matching human approval",
            "INV-004",
        )
    return ALLOW


def _request_evidence(state: JobState, context: dict) -> Authorization:
    """PRD 18 - only *required* evidence may be requested from a technician.

    A batched request is allowed when at least one of its requirements
    genuinely needs evidence; ids that do not qualify are reported rather than
    silently carried along.
    """
    ids = context.get("requirement_ids") or (
        [context["requirement_id"]] if context.get("requirement_id") else []
    )
    if not ids:
        return Authorization(False, "no requirement referenced", "INV-002")

    refusals = []
    for requirement_id in ids:
        auth = _request_one(state, requirement_id)
        if auth.allowed:
            return ALLOW
        refusals.append(f"{requirement_id}: {auth.reason}")
    return Authorization(False, "; ".join(refusals), "INV-002")


def _request_one(state: JobState, requirement_id: str) -> Authorization:
    requirement = next((r for r in state.requirements if r.id == requirement_id), None)
    if requirement is None:
        return Authorization(False, "unknown requirement")
    if not requirement.required:
        return Authorization(False, "not a required requirement", "INV-002")
    if requirement.status == RequirementStatus.VERIFIED and not _open_blocking_for(
        state, requirement_id
    ):
        return Authorization(False, "already verified")
    return ALLOW


def _open_blocking_for(state: JobState, requirement_id: str) -> bool:
    """A verified requirement can still need evidence.

    Two filters were authorized and two are confirmed installed, so the
    requirement reads VERIFIED - while the receipt says a third was bought and
    nothing shows it installed. The requirement is satisfied; the job is not.
    Evidence recovery stays open as long as a blocking conflict names it.
    """
    return any(
        c.requirement_id == requirement_id and c.severity == ConflictSeverity.BLOCKING
        for c in state.unresolved_conflicts()
    )


def _request_clarification(state: JobState, context: dict) -> Authorization:
    """A clarification may only relay a question a supervisor actually asked."""
    decision = state.decision_by_id(str(context.get("decision_id") or ""))
    if decision is None:
        return Authorization(False, "no decision referenced")
    if decision.decision != DecisionAction.REQUEST_CLARIFICATION:
        return Authorization(False, f"{decision.id} did not request clarification")
    conflict = state.conflict_by_id(decision.conflict_id)
    if conflict is None or conflict.status != ConflictStatus.AWAITING_CLARIFICATION:
        return Authorization(False, f"{decision.conflict_id} is not awaiting clarification")
    return ALLOW


def _create_decision(state: JobState, context: dict) -> Authorization:
    conflict_id = context.get("conflict_id")
    conflict = next((c for c in state.conflicts if c.id == conflict_id), None)
    if conflict is None:
        return Authorization(False, f"unknown conflict {conflict_id}")
    if conflict.status != ConflictStatus.OPEN:
        return Authorization(False, f"{conflict.id} is already {conflict.status.value}")
    existing = [
        d
        for d in state.decisions
        if d.conflict_id == conflict_id and d.status == DecisionStatus.PENDING
    ]
    if existing:
        # INV-006 - a paused workflow resumes exactly once.
        return Authorization(
            False, f"decision {existing[0].id} is already pending for {conflict_id}", "INV-006"
        )
    return ALLOW


def _create_invoice(state: JobState, context: dict) -> Authorization:
    if state.blocking_conflicts():
        return Authorization(False, "cannot invoice with blocking conflicts open", "INV-001")
    if state.job.status not in (JobStatus.VERIFIED, JobStatus.CLOSING, JobStatus.CLOSED):
        return Authorization(
            False, f"job must be verified before invoicing, is {state.job.status.value}"
        )
    return _increase_invoice(state, {"amount": context.get("additional_amount", 0.0)})


def _always(state: JobState, context: dict) -> Authorization:
    return ALLOW


_CHECKS = {
    ActionType.CLOSE_JOB: _close_job,
    ActionType.INCREASE_INVOICE: _increase_invoice,
    ActionType.REQUEST_EVIDENCE: _request_evidence,
    ActionType.REQUEST_CLARIFICATION: _request_clarification,
    ActionType.CREATE_DECISION: _create_decision,
    ActionType.CREATE_CONFLICT: _always,
    ActionType.CREATE_INVOICE: _create_invoice,
    ActionType.GENERATE_REPORT: _always,
    ActionType.NOTIFY_CUSTOMER: _always,
}
