"""Decision endpoints (PRD 23, FR-10, FR-11, FR-12)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from tools.decisions import resolve_decision

from ..deps import get_store
from ..schemas import DecisionIn

router = APIRouter(prefix="/api/decisions", tags=["decisions"])


@router.get("")
def list_decisions(status: str | None = "PENDING"):
    """The supervisor queue."""
    store = get_store()
    if hasattr(store, "list_decisions"):
        return store.list_decisions(status)
    return []


@router.get("/{decision_id}")
def get_decision(decision_id: str):
    """PRD 14 Screen 3 - the hero decision card, with everything needed to judge."""
    store = get_store()
    decision = store.get_decision(decision_id)
    if decision is None:
        raise HTTPException(404, f"decision {decision_id} not found")

    state = store.get_state(decision.job_id)
    conflict = next((c for c in state.conflicts if c.id == decision.conflict_id), None)
    return {
        "decision": decision,
        "conflict": conflict,
        "job": state.job,
        "evidence": [e for e in state.evidence if e.id in decision.evidence_ids],
        "claims": [
            c for c in state.claims if conflict and c.id in conflict.claim_ids
        ],
    }


@router.post("/{decision_id}")
def resolve(decision_id: str, payload: DecisionIn):
    """PRD FR-12 - resolving unblocks the workflow; the supervisor re-runs nothing.

    Idempotent: a repeated POST returns the original outcome (INV-006).
    """
    result = resolve_decision(
        decision_id,
        payload.decision,
        decided_by=payload.decided_by,
        comment=payload.comment,
    )
    if not result.ok:
        raise HTTPException(404, result.message)
    return result.to_dict()
