"""Job context tools (PRD 24)."""

from __future__ import annotations

from typing import Any

from domain.enums import ActionType, EventType, JobStatus
from domain.state_machine import assert_transition
from infra.settings import get_store
from tools.base import ToolResult, fieldproof_tool


def get_job_context(job_id: str) -> dict[str, Any]:
    """Read-only view the Context Agent works from (PRD 16, Agent 1).

    Returns requirements, policies and allowed actions - never raw storage.
    """
    state = get_store().get_state(job_id)
    return {
        "job_id": state.job.id,
        "status": state.job.status.value,
        "description": state.job.description,
        "technician_id": state.job.technician_id,
        "authorized_amount": state.job.authorized_amount,
        "max_additional_spend_without_approval": (
            state.job.max_additional_spend_without_approval
        ),
        "requirements": [
            {
                "id": r.id,
                "type": r.type.value,
                "description": r.description,
                "required": r.required,
                "status": r.status.value,
                "expected_quantity": r.expected_quantity,
                "part_number": r.part_number,
            }
            for r in state.requirements
        ],
        "evidence_count": len(state.active_evidence()),
        "open_conflicts": [c.id for c in state.open_conflicts()],
        "pending_decisions": [d.id for d in state.pending_decisions()],
    }


def set_job_status(job_id: str, status: JobStatus, *, message: str | None = None) -> ToolResult:
    """Move the job through the state machine (PRD 20). Refuses illegal moves.

    Every transition is recorded (INV-007); only those given a message show on
    the timeline.
    """
    from domain.events import make_event
    from infra.settings import get_event_bus

    store = get_store()
    state = store.get_state(job_id)
    previous = state.job.status
    assert_transition(previous, status)
    if previous != status:
        store.save_job(state.job.model_copy(update={"status": status}))
        event = store.append_event(
            make_event(
                job_id,
                EventType.JOB_STATUS_CHANGED,
                message=message,
                previous=previous.value,
                status=status.value,
            )
        )
        get_event_bus().publish(event)
    return ToolResult(
        ok=True,
        action="set_job_status",
        job_id=job_id,
        data={"status": status.value, "previous": previous.value},
        message=message or f"Job status is now {status.value}",
    )


@fieldproof_tool(ActionType.CLOSE_JOB, EventType.JOB_CLOSED)
def close_job(state, **_: Any) -> tuple[dict[str, Any], str]:
    """Close the work order. Authorization enforces INV-001 and INV-002."""
    from domain.ids import utcnow

    store = get_store()
    job = state.job.model_copy(update={"status": JobStatus.CLOSED, "closed_at": utcnow()})
    store.save_job(job)
    return (
        {"status": JobStatus.CLOSED.value, "final_amount": job.final_amount},
        "Job closed automatically",
    )
