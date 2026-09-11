"""Closeout report, invoice payload and audit receipt (PRD FR-13, FR-14, FR-15, 29)."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from domain.enums import ActionType, ConflictStatus, EventType, RequirementStatus
from domain.ids import receipt_id_for, utcnow_iso
from infra.settings import get_store
from tools.base import fieldproof_tool


@fieldproof_tool(ActionType.GENERATE_REPORT, EventType.ACTION_EXECUTED)
def generate_closeout_report(state, **_: Any) -> tuple[dict[str, Any], str]:
    """PRD FR-13 - what was done, with what parts, backed by what evidence."""
    report = {
        "job_id": state.job.id,
        "customer_id": state.job.customer_id,
        "technician_id": state.job.technician_id,
        "work_completed": [
            {"requirement": r.description, "status": r.status.value, "notes": r.notes}
            for r in state.requirements
        ],
        "parts_used": [
            {"part_number": c.part_number, "quantity": c.quantity}
            for c in state.claims
            if c.type.value == "part_installed"
        ],
        "evidence_summary": [
            {
                "evidence_id": e.id,
                "type": e.type.value,
                "sha256": e.sha256,
                "uploaded_by": e.uploaded_by,
            }
            for e in state.active_evidence()
        ],
        "exceptions": [
            {"conflict_id": c.id, "type": c.type.value, "status": c.status.value}
            for c in state.conflicts
        ],
        "approvals": [
            {
                "decision_id": d.id,
                "decision": d.decision.value if d.decision else None,
                "decided_by": d.decided_by,
            }
            for d in state.decisions
            if d.status.value == "RESOLVED"
        ],
        "final_billable_amount": billable_amount(state),
        "summary": _summary(state),
    }
    return {"report": report}, "Closeout report generated"


def _summary(state) -> str:
    from agents.reconciliation.agent import explain
    from domain.reconciliation.engine import reconcile

    return explain(state, reconcile(state))


@fieldproof_tool(ActionType.CREATE_INVOICE, EventType.ACTION_EXECUTED)
def prepare_invoice(state, *, additional_amount: float = 0.0, **_: Any):
    """PRD FR-14 - build the invoice payload and hand it to the provider.

    Authorization refuses an amount above the allowance unless a matching human
    approval exists (INV-004). If the provider fails, the wrapper releases the
    idempotency key and the job stays VERIFIED for a retry (PRD 36).
    """
    from domain.events import idempotency_key
    from infra.settings import get_invoice_provider

    amount = billable_amount(state)
    payload = {
        "job_id": state.job.id,
        "customer_id": state.job.customer_id,
        "amount": amount,
        "status": "ready_to_invoice",
    }
    store = get_store()
    try:
        invoice = get_invoice_provider().submit(
            payload, idempotency_key("invoice", state.job.id, f"{amount:.2f}")
        )
    except Exception:
        metadata = {**state.job.metadata, "invoice_action": "FAILED"}
        store.save_job(state.job.model_copy(update={"metadata": metadata}))
        raise
    metadata = {**state.job.metadata, "invoice_action": "SUBMITTED", "invoice": invoice}
    store.save_job(state.job.model_copy(update={"final_amount": amount, "metadata": metadata}))
    return {"invoice": invoice}, f"Invoice updated: {amount:.2f} ready to invoice"


@fieldproof_tool(ActionType.NOTIFY_CUSTOMER, EventType.ACTION_EXECUTED)
def send_customer_package(state, **_: Any):
    """PRD 12 - the customer receives the closeout summary."""
    from infra.settings import get_notifier

    summary = (
        f"Your service visit for {state.job.description} is complete. "
        f"Final amount: {billable_amount(state):.2f}."
    )
    message_id = get_notifier().send(state.job.customer_id, summary, job_id=state.job.id)
    return (
        {"message_id": message_id, "recipient": state.job.customer_id},
        "Customer package created",
    )


def billable_amount(state) -> float:
    """Base authorization plus approved additional work only (INV-004)."""
    approved_extra = sum(
        d.financial_impact
        for d in state.decisions
        if d.status.value == "RESOLVED" and d.decision is not None and d.decision.value == "APPROVE"
    )
    return round(state.job.authorized_amount + approved_extra, 2)


def generate_evidence_receipt(job_id: str) -> dict[str, Any]:
    """PRD FR-15 / 29 - the proof page. Hashed so tampering is evident.

    A closed job returns the receipt sealed at close. Recomputing it on every
    read would change the timestamp and therefore the hash, which would make
    the hash worthless as evidence. Open jobs get a provisional receipt.
    """
    state = get_store().get_state(job_id)
    sealed = state.job.metadata.get("receipt")
    if sealed:
        return sealed
    return build_receipt(state, provisional=True)


def seal_receipt(job_id: str) -> dict[str, Any]:
    """Build the final receipt once, at close, and store it with the job."""
    from domain.events import make_event
    from infra.settings import get_event_bus

    store = get_store()
    state = store.get_state(job_id)
    if state.job.metadata.get("receipt"):
        return state.job.metadata["receipt"]
    receipt = build_receipt(state, provisional=False)
    metadata = {**state.job.metadata, "receipt": receipt}
    store.save_job(state.job.model_copy(update={"metadata": metadata}))
    event = store.append_event(
        make_event(
            job_id,
            EventType.ACTION_EXECUTED,
            message="Receipt generated",
            action="generate_receipt",
            receipt_id=receipt["receipt_id"],
            sha256=receipt["sha256"],
        )
    )
    get_event_bus().publish(event)
    return receipt


def verify_receipt(receipt: dict[str, Any]) -> bool:
    """Recompute the hash over everything except the hash itself."""
    body = {k: v for k, v in receipt.items() if k != "sha256"}
    return canonical_hash(body) == receipt.get("sha256")


def build_receipt(state, *, provisional: bool) -> dict[str, Any]:
    job_id = state.job.id
    required = state.required_requirements()
    receipt: dict[str, Any] = {
        "receipt_id": receipt_id_for(job_id),
        "job_id": job_id,
        "result": state.job.status.value,
        "provisional": provisional,
        "generated_at": utcnow_iso(),
        "requirements": {
            "total": len(required),
            "verified": sum(1 for r in required if r.status == RequirementStatus.VERIFIED),
            "detail": [
                {
                    "id": r.id,
                    "description": r.description,
                    "status": r.status.value,
                    "supported_by": r.supporting_claim_ids,
                }
                for r in state.requirements
            ],
        },
        "claims": [
            {
                "id": c.id,
                "type": c.type.value,
                "part_number": c.part_number,
                "quantity": c.quantity,
                "confidence": c.confidence,
                "evidence": [link.evidence_id for link in state.links if link.claim_id == c.id],
            }
            for c in state.claims
        ],
        "evidence": [
            {"id": e.id, "type": e.type.value, "sha256": e.sha256}
            for e in state.active_evidence()
        ],
        "conflicts": [
            {
                "id": c.id,
                "type": c.type.value,
                "severity": c.severity.value,
                "resolution": RESOLUTION[c.status],
                "decision_id": c.resolution_decision_id,
            }
            for c in state.conflicts
        ],
        "decisions": [
            {
                "id": d.id,
                "question": d.question,
                "decision": d.decision.value if d.decision else None,
                "decided_by": d.decided_by,
                "policy": d.policy,
            }
            for d in state.decisions
        ],
        "actions": [
            e.payload.get("action", e.type.value)
            for e in state.events
            if e.type
            in (EventType.EVIDENCE_REQUESTED, EventType.ACTION_EXECUTED, EventType.JOB_CLOSED)
        ],
        "final_amount": state.job.final_amount,
    }
    receipt["sha256"] = canonical_hash(receipt)
    return receipt


RESOLUTION = {
    ConflictStatus.OPEN: "UNRESOLVED",
    ConflictStatus.AWAITING_CLARIFICATION: "AWAITING_CLARIFICATION",
    ConflictStatus.CLEARED: "CLEARED_BY_EVIDENCE",
    ConflictStatus.AUTO_RESOLVED: "AUTO_RESOLVED",
    ConflictStatus.HUMAN_APPROVED: "HUMAN_APPROVED",
    ConflictStatus.HUMAN_REJECTED: "HUMAN_REJECTED",
}


def canonical_hash(receipt: dict[str, Any]) -> str:
    """SHA256 over the canonicalized receipt (PRD 29)."""
    payload = json.dumps(receipt, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
