"""Evidence endpoints (PRD 23, FR-02, 34).

Three ways in, one way recorded:

    POST /api/jobs/{id}/evidence                multipart upload through the API
    POST /api/jobs/{id}/evidence/upload-url     signed URL, then PUT the bytes...
    POST /api/jobs/{id}/evidence/confirm        ...then confirm to register them

Every path ends in the same place: an immutable Evidence record with a content
hash, and an EVIDENCE_UPLOADED event that re-enters the workflow.
"""

from __future__ import annotations

import base64
import json
import time
import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile, status

from domain.enums import EventType, EvidenceType, JobStatus
from domain.events import make_event
from domain.models import Evidence
from infra.settings import get_settings
from tools.evidence import register_evidence, safe_filename, supersede_evidence, upload_evidence

from ..deps import get_event_bus, get_object_store, get_store, load_state
from ..schemas import ConfirmUploadIn, EvidenceIn, UploadUrlIn
from ..security import UploadGrant, sign_upload, verify_upload

router = APIRouter(tags=["evidence"])
#: Mounted without the API-key dependency: the signed token is the credential.
uploads_router = APIRouter(tags=["evidence"])


@router.post("/api/jobs/{job_id}/evidence", status_code=status.HTTP_201_CREATED)
async def upload(
    job_id: str,
    file: Annotated[UploadFile, File()],
    type: Annotated[EvidenceType, Form()],
    uploaded_by: Annotated[str, Form()],
    stage: Annotated[str | None, Form()] = None,
    metadata: Annotated[str | None, Form(description="JSON object")] = None,
) -> Evidence:
    """PRD FR-02 - images, PDFs, receipts, audio, signatures."""
    _writable(job_id)
    data = await _read_capped(file)
    evidence = upload_evidence(
        job_id,
        filename=file.filename or "artifact",
        data=data,
        evidence_type=type,
        uploaded_by=uploaded_by,
        content_type=file.content_type,
        metadata=_metadata(metadata, stage),
    )
    _announce(evidence)
    return evidence


@router.post("/api/jobs/{job_id}/evidence/json", status_code=status.HTTP_201_CREATED)
def upload_json(job_id: str, payload: EvidenceIn) -> Evidence:
    """Same as the multipart upload, for fixtures and scripted demos."""
    _writable(job_id)
    if payload.content_base64:
        data = base64.b64decode(payload.content_base64)
    elif payload.text is not None:
        data = payload.text.encode("utf-8")
    else:
        raise HTTPException(400, "provide content_base64 or text")
    _check_size(len(data))
    evidence = upload_evidence(
        job_id,
        filename=payload.filename,
        data=data,
        evidence_type=payload.type,
        uploaded_by=payload.uploaded_by,
        content_type=payload.content_type,
        metadata=payload.metadata,
    )
    _announce(evidence)
    return evidence


@router.post("/api/jobs/{job_id}/evidence/upload-url")
def create_upload_url(job_id: str, payload: UploadUrlIn):
    """PRD 34 - a short-lived URL the client PUTs the bytes to directly."""
    _writable(job_id)
    settings = get_settings()
    key = f"{job_id}/uploads/{uuid.uuid4().hex[:12]}-{safe_filename(payload.filename)}"
    ttl = settings.upload_url_ttl_seconds
    if settings.is_local:
        grant = UploadGrant(job_id, key, payload.content_type, int(time.time()) + ttl)
        url = f"{settings.public_base_url.rstrip('/')}/api/evidence/upload/{sign_upload(grant)}"
    else:
        url = get_object_store().presigned_put(key, payload.content_type, ttl)
    headers = {"Content-Type": payload.content_type} if payload.content_type else {}
    return {"upload_url": url, "method": "PUT", "headers": headers, "key": key, "expires_in": ttl}


@uploads_router.put("/api/evidence/upload/{token}", status_code=status.HTTP_204_NO_CONTENT)
async def receive_signed_upload(token: str, request: Request) -> Response:
    """Local stand-in for S3's presigned PUT."""
    grant = verify_upload(token)
    data = await request.body()
    _check_size(len(data))
    get_object_store().put(grant.key, data, grant.content_type)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/api/jobs/{job_id}/evidence/confirm", status_code=status.HTTP_201_CREATED)
def confirm_upload(job_id: str, payload: ConfirmUploadIn) -> Evidence:
    """Register bytes that arrived through a signed URL. The hash is computed
    here, from what is actually stored - never taken from the client."""
    state = _writable(job_id)
    if not payload.key.startswith(f"{job_id}/uploads/"):
        raise HTTPException(403, "key does not belong to this job")
    if any(e.metadata.get("object_key") == payload.key for e in state.evidence):
        raise HTTPException(409, "that upload is already registered")
    try:
        data = get_object_store().get(payload.key)
    except Exception:  # noqa: BLE001 - missing object, whatever the backend
        raise HTTPException(404, "nothing was uploaded to that key") from None
    evidence = register_evidence(
        job_id,
        key=payload.key,
        storage_url=_storage_url(payload.key),
        data=data,
        filename=payload.filename,
        evidence_type=payload.type,
        uploaded_by=payload.uploaded_by,
        content_type=payload.content_type,
        metadata=_metadata(None, payload.stage) | payload.metadata,
    )
    _announce(evidence)
    return evidence


@router.post(
    "/api/jobs/{job_id}/evidence/{evidence_id}/replace", status_code=status.HTTP_201_CREATED
)
async def replace(
    job_id: str,
    evidence_id: str,
    file: Annotated[UploadFile, File()],
    uploaded_by: Annotated[str, Form()],
) -> Evidence:
    """INV-009 - the old artifact is superseded and every conclusion drawn
    from it is recomputed on the next pass."""
    state = _writable(job_id)
    old = state.evidence_by_id(evidence_id)
    if old is None:
        raise HTTPException(404, f"evidence {evidence_id} not found")
    if old.superseded_by:
        raise HTTPException(409, f"{evidence_id} was already replaced by {old.superseded_by}")
    data = await _read_capped(file)
    keep = {k: v for k, v in old.metadata.items() if k == "stage"}
    new = upload_evidence(
        job_id,
        filename=file.filename or old.filename or "artifact",
        data=data,
        evidence_type=old.type,
        uploaded_by=uploaded_by,
        content_type=file.content_type,
        metadata={**keep, "replaces": old.id},
    )
    supersede_evidence(job_id, old.id, new.id)
    _announce(new, replaces=old.id)
    return new


@router.get("/api/evidence/blob/{key:path}")
def get_blob(key: str):
    """PRD 34 - evidence is served through an authenticated endpoint."""
    try:
        data = get_object_store().get(key)
    except Exception:  # noqa: BLE001
        raise HTTPException(404, "artifact not found") from None
    return Response(content=data, media_type="application/octet-stream")


# -- helpers -------------------------------------------------------------------


def _writable(job_id: str):
    state = load_state(job_id)
    if state.job.status == JobStatus.CLOSED:
        raise HTTPException(409, "job is closed; its receipt is sealed")
    return state


async def _read_capped(file: UploadFile) -> bytes:
    data = await file.read(get_settings().max_upload_bytes + 1)
    _check_size(len(data))
    return data


def _check_size(size: int) -> None:
    limit = get_settings().max_upload_bytes
    if size > limit:
        raise HTTPException(413, f"artifact exceeds the {limit // (1024 * 1024)} MB limit")
    if size == 0:
        raise HTTPException(400, "artifact is empty")


def _metadata(raw: str | None, stage: str | None) -> dict:
    metadata: dict = {}
    if raw:
        try:
            metadata = json.loads(raw)
        except ValueError:
            raise HTTPException(400, "metadata must be a JSON object") from None
        if not isinstance(metadata, dict):
            raise HTTPException(400, "metadata must be a JSON object")
    if stage:
        if stage not in ("before", "after"):
            raise HTTPException(400, "stage must be 'before' or 'after'")
        metadata["stage"] = stage
    return metadata


def _storage_url(key: str) -> str:
    settings = get_settings()
    if settings.is_local:
        return f"/api/evidence/blob/{key}"
    return f"s3://{settings.bucket_name}/evidence/{key}"


def _announce(evidence: Evidence, *, replaces: str | None = None) -> None:
    store = get_store()
    label = evidence.type.value.replace("_", " ")
    event = store.append_event(
        make_event(
            evidence.job_id,
            EventType.EVIDENCE_UPLOADED,
            message=f"Replacement {label} received" if replaces else f"New {label} received",
            actor=evidence.uploaded_by,
            evidence_id=evidence.id,
            replaces=replaces,
        )
    )
    get_event_bus().publish(event)
