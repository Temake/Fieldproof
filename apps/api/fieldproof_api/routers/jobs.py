"""Job endpoints (PRD 23)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from domain.enums import EventType, JobStatus
from domain.events import make_event
from domain.ids import JOB, new_id, utcnow
from domain.models import Job, Requirement
from tools.jobs import set_job_status

from ..deps import get_event_bus, get_store, load_state
from ..schemas import JobIn

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("")
def create_job(payload: JobIn):
    """PRD FR-01 - accept a structured work-order definition."""
    store = get_store()
    job_id = payload.id or new_id(JOB)
    if any(j.id == job_id for j in store.list_jobs()):
        raise HTTPException(409, f"job {job_id} already exists")
    job = Job(
        id=job_id,
        customer_id=payload.customer_id,
        technician_id=payload.technician_id,
        technician_name=payload.technician_name,
        description=payload.description,
        site_address=payload.site_address,
        authorized_amount=payload.authorized_amount,
        max_additional_spend_without_approval=payload.max_additional_spend_without_approval,
        status=JobStatus.IN_PROGRESS,
        metadata=payload.metadata,
    )
    requirements = [
        Requirement(job_id=job_id, **r.model_dump()) for r in payload.requirements
    ]
    state = store.create_job(job, requirements)
    event = store.append_event(
        make_event(job_id, EventType.JOB_CREATED, message="Work order created")
    )
    get_event_bus().publish(event)
    return state


@router.get("")
def list_jobs(status: str | None = None):
    return get_store().list_jobs(status)


@router.get("/{job_id}")
def get_job(job_id: str):
    return load_state(job_id)


@router.post("/{job_id}/complete")
def complete_job(job_id: str):
    """PRD 10 - the technician clicks Complete Job and walks away.

    This returns immediately. Everything after it happens on the event bus.
    """
    state = load_state(job_id)
    if state.job.status not in (JobStatus.IN_PROGRESS, JobStatus.OPEN):
        raise HTTPException(400, f"job is {state.job.status.value}, cannot complete")

    store = get_store()
    store.save_job(state.job.model_copy(update={"completed_at": utcnow()}))
    set_job_status(job_id, JobStatus.SUBMITTED)

    event = store.append_event(
        make_event(
            job_id,
            EventType.JOB_COMPLETED,
            message="Technician completed job",
            actor=state.job.technician_id,
        )
    )
    get_event_bus().publish(event)
    return {"job_id": job_id, "status": JobStatus.SUBMITTED.value, "accepted": True}


@router.post("/{job_id}/retry", status_code=202)
def retry(job_id: str):
    """Re-run the workflow after a failure (PRD 36), e.g. an invoice provider outage."""
    from agents.orchestrator.graph import RUNNABLE

    state = load_state(job_id)
    if state.job.status not in RUNNABLE:
        raise HTTPException(409, f"job is {state.job.status.value}; nothing to retry")
    store = get_store()
    event = store.append_event(
        make_event(job_id, EventType.WORKFLOW_RETRY_REQUESTED, actor="supervisor")
    )
    get_event_bus().publish(event)
    return {"job_id": job_id, "accepted": True}


@router.get("/{job_id}/events")
def get_timeline(job_id: str):
    """PRD 14 Screen 2 - the timeline that visibly proves autonomy."""
    state = load_state(job_id)
    return sorted(state.events, key=lambda e: e.created_at)


@router.get("/{job_id}/runs")
def get_runs(job_id: str):
    """PRD 35 - every workflow run: id, trigger, steps, tools, duration, outcome, error."""
    state = load_state(job_id)
    runs = [
        {"type": e.type.value, "created_at": e.created_at, **e.payload}
        for e in state.events
        if e.type in (EventType.WORKFLOW_RUN_COMPLETED, EventType.WORKFLOW_RUN_FAILED)
    ]
    return sorted(runs, key=lambda r: r["created_at"])


@router.get("/{job_id}/messages")
def get_messages(job_id: str):
    """What FieldProof sent to the technician and customer (simulated delivery)."""
    from infra.settings import get_notifier

    load_state(job_id)
    notifier = get_notifier()
    sent = notifier.for_job(job_id) if hasattr(notifier, "for_job") else []
    return [{"id": m.id, "recipient": m.recipient, "message": m.message} for m in sent]


@router.get("/{job_id}/receipt")
def get_receipt(job_id: str):
    """PRD FR-15 - the final proof page. Sealed at close; provisional before."""
    from tools.reports import generate_evidence_receipt

    load_state(job_id)
    return generate_evidence_receipt(job_id)


@router.get("/{job_id}/receipt/verify")
def verify(job_id: str):
    """PRD 29 - recompute the receipt hash to show it has not been altered."""
    from tools.reports import generate_evidence_receipt, verify_receipt

    load_state(job_id)
    receipt = generate_evidence_receipt(job_id)
    return {
        "receipt_id": receipt["receipt_id"],
        "sealed": not receipt.get("provisional", True),
        "sha256": receipt["sha256"],
        "valid": verify_receipt(receipt),
    }


@router.get("/{job_id}/graph")
def get_evidence_graph(job_id: str):
    """PRD 14 Screen 4 - requirement -> claim -> evidence relationships."""
    state = load_state(job_id)
    return {
        "nodes": (
            [
                {"id": r.id, "kind": "requirement", "label": r.description,
                 "status": r.status.value}
                for r in state.requirements
            ]
            + [
                {"id": c.id, "kind": "claim", "label": c.type.value,
                 "quantity": c.quantity, "confidence": c.confidence}
                for c in state.claims
            ]
            + [
                {"id": e.id, "kind": "evidence", "label": e.type.value,
                 "filename": e.filename}
                for e in state.active_evidence()
            ]
        ),
        "edges": (
            [
                {"from": r.id, "to": claim_id, "kind": "satisfied_by"}
                for r in state.requirements
                for claim_id in r.supporting_claim_ids
            ]
            + [
                {"from": link.claim_id, "to": link.evidence_id,
                 "kind": link.relationship.value, "confidence": link.confidence}
                for link in state.links
            ]
        ),
    }
