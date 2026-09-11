"""Evidence tools (PRD 24, FR-02, FR-08)."""

from __future__ import annotations

from typing import Any

from domain.enums import ActionType, EventType, EvidenceType
from domain.ids import utcnow
from domain.models import Claim, ClaimEvidenceLink, Evidence
from infra.adapters.object_store import sha256_hex
from infra.settings import get_notifier, get_object_store, get_store
from tools.base import fieldproof_tool

#: Metadata keys the system owns. Uploaders may not set them (PRD 34 - sanitized input).
RESERVED_METADATA = frozenset(
    {"object_key", "size_bytes", "extraction_failed", "extraction_error", "receipt"}
)


def safe_filename(name: str | None) -> str:
    """Strip paths and odd characters; artifact names end up in object keys."""
    base = (name or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    cleaned = "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in base).strip(".-")
    return cleaned[:100] or "artifact"


def upload_evidence(
    job_id: str,
    *,
    filename: str,
    data: bytes,
    evidence_type: EvidenceType,
    uploaded_by: str,
    content_type: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Evidence:
    """Persist an artifact with an immutable id, hash and storage URL (FR-02)."""
    filename = safe_filename(filename)
    digest = sha256_hex(data)
    key = f"{job_id}/{digest[:12]}-{filename}"
    url = get_object_store().put(key, data, content_type)
    return register_evidence(
        job_id,
        key=key,
        storage_url=url,
        data=data,
        filename=filename,
        evidence_type=evidence_type,
        uploaded_by=uploaded_by,
        content_type=content_type,
        metadata=metadata,
    )


def register_evidence(
    job_id: str,
    *,
    key: str,
    storage_url: str,
    data: bytes,
    filename: str,
    evidence_type: EvidenceType,
    uploaded_by: str,
    content_type: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Evidence:
    """Record bytes that are already in the object store (direct or signed upload)."""
    clean = {k: v for k, v in (metadata or {}).items() if k not in RESERVED_METADATA}
    evidence = Evidence(
        job_id=job_id,
        type=evidence_type,
        storage_url=storage_url,
        sha256=sha256_hex(data),
        uploaded_by=uploaded_by,
        filename=safe_filename(filename),
        content_type=content_type,
        metadata={**clean, "object_key": key, "size_bytes": len(data)},
    )
    return get_store().add_evidence(evidence)


def get_evidence(job_id: str, evidence_id: str) -> dict[str, Any]:
    """Structured view of one artifact - agents never receive raw bytes here."""
    state = get_store().get_state(job_id)
    evidence = state.evidence_by_id(evidence_id)
    if evidence is None:
        return {"error": f"unknown evidence {evidence_id}"}
    return {
        "evidence_id": evidence.id,
        "type": evidence.type.value,
        "filename": evidence.filename,
        "sha256": evidence.sha256,
        "uploaded_by": evidence.uploaded_by,
        "created_at": evidence.created_at.isoformat(),
        "transcript": evidence.transcript,
        "observations": [o.model_dump() for o in evidence.observations],
        "superseded_by": evidence.superseded_by,
    }


def save_observations(
    job_id: str,
    evidence_id: str,
    observations,
    transcript: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Evidence:
    """Record what the Evidence Agent extracted from one artifact (FR-03)."""
    store = get_store()
    state = store.get_state(job_id)
    evidence = state.evidence_by_id(evidence_id)
    if evidence is None:
        raise KeyError(evidence_id)
    evidence.observations = list(observations)
    evidence.transcript = transcript if transcript is not None else evidence.transcript
    evidence.metadata = {**evidence.metadata, **(metadata or {})}
    evidence.processed_at = utcnow()
    return store.save_evidence(evidence)


def save_claims(job_id: str, claims: list[Claim], links: list[ClaimEvidenceLink]) -> None:
    """Replace the claim set. Full replacement keeps INV-009 honest."""
    get_store().replace_claims(job_id, claims, links)


def supersede_evidence(job_id: str, old_evidence_id: str, new_evidence_id: str) -> None:
    """INV-009 - replacing an artifact invalidates conclusions drawn from it."""
    store = get_store()
    state = store.get_state(job_id)
    old = state.evidence_by_id(old_evidence_id)
    if old is None:
        raise KeyError(old_evidence_id)
    old.superseded_by = new_evidence_id
    store.save_evidence(old)


@fieldproof_tool(ActionType.REQUEST_EVIDENCE, EventType.EVIDENCE_REQUESTED)
def request_technician_evidence(
    state, *, requirement_ids: list[str], message: str, **_: Any
) -> tuple[dict[str, Any], str]:
    """Ask the technician for a specific missing artifact (FR-08, PRD G4).

    Authorization refuses anything that is not a genuinely required, unverified
    requirement, so the agent cannot pester a technician on a hunch.
    """
    recipient = state.job.technician_id
    message_id = get_notifier().send(recipient, message, job_id=state.job.id)
    return (
        {
            "requirement_ids": list(requirement_ids),
            "recipient": recipient,
            "message": message,
            "message_id": message_id,
        },
        f"Technician contacted automatically: {message}",
    )
