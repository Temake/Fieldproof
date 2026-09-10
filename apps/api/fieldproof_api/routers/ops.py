"""Dashboard and metrics (PRD 14 Screen 1, PRD 38)."""

from __future__ import annotations

from fastapi import APIRouter

from domain.enums import EventType, JobStatus

from ..deps import get_store
from ..schemas import DashboardCounts, Metrics

router = APIRouter(prefix="/api", tags=["ops"])


@router.get("/dashboard", response_model=DashboardCounts)
def dashboard() -> DashboardCounts:
    jobs = get_store().list_jobs()
    return DashboardCounts(
        processing=sum(
            1 for j in jobs if j.status in (JobStatus.VERIFYING, JobStatus.CLOSING)
        ),
        closed_automatically=sum(1 for j in jobs if j.status == JobStatus.CLOSED),
        waiting_on_technician=sum(
            1 for j in jobs if j.status == JobStatus.WAITING_FOR_EVIDENCE
        ),
        decision_required=sum(
            1 for j in jobs if j.status == JobStatus.WAITING_FOR_DECISION
        ),
    )


@router.get("/jobs/{job_id}/metrics", response_model=Metrics)
def job_metrics(job_id: str) -> Metrics:
    """PRD 38 - the closing slide, computed from real events rather than typed in."""
    state = get_store().get_state(job_id)
    steps = [e for e in state.events if e.type == EventType.AGENT_STEP_STARTED]
    technician = [e for e in state.events if e.type == EventType.EVIDENCE_REQUESTED]
    supervisor = [e for e in state.events if e.type == EventType.DECISION_RESOLVED]
    total = len(steps) + len(technician) + len(supervisor)
    human = len(technician) + len(supervisor)
    return Metrics(
        workflow_steps=total,
        handled_autonomously=total - human,
        technician_interactions=len(technician),
        supervisor_decisions=len(supervisor),
        manual_document_reviews=0,
        automation_rate=round((total - human) / total, 3) if total else 0.0,
    )
