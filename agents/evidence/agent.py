"""Agent 2 - Evidence Agent (PRD 16, FR-03, FR-04, FR-05).

Turns unstructured artifacts into structured observations. This is the only
agent that touches a multimodal model.

Dispatch is deterministic - the artifact type picks the tool, not the model.
The agent output is deliberately narrow: observations with a confidence value.
Claims are built afterwards in domain/claims/normalize.py, so a hallucinated
claim type cannot reach the reconciliation engine.

Failure handling follows PRD 36:

    retry            (inside each tool call)
    alternate parse  (a second tool that can read the same bytes)
    human fallback   (an 'unreadable' observation at confidence 0.0, which
                      reconciliation turns into a request for a better artifact)

An artifact that could not be read must never count as present.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from agents.runtime import stub_mode
from domain.enums import EvidenceType
from domain.models import Evidence, JobState, Observation

from . import tools
from .tools import EVIDENCE_SYSTEM_PROMPT as SYSTEM_PROMPT  # noqa: F401 - re-exported
from .tools import Reading

log = logging.getLogger("fieldproof.evidence")

Tool = Callable[[Evidence, bytes, dict[str, Any]], Reading]

#: Primary tool, then the alternate that can read the same bytes another way.
DISPATCH: dict[EvidenceType, tuple[Tool, ...]] = {
    EvidenceType.IMAGE: (tools.read_image,),
    EvidenceType.SIGNATURE: (tools.read_image, tools.read_document),
    EvidenceType.RECEIPT: (tools.extract_receipt, tools.read_document),
    EvidenceType.PDF: (tools.read_document,),
    EvidenceType.CHECKLIST: (tools.read_document,),
    EvidenceType.VOICE_NOTE: (tools.transcribe_audio,),
}


def analyze(evidence: Evidence, state: JobState | None = None) -> Reading:
    """Extract observations from one artifact."""
    if stub_mode():
        from .extractors import extract_stub

        observations, transcript = extract_stub(evidence)
        return Reading(observations=observations, transcript=transcript)

    try:
        blob = _load(evidence)
    except Exception as exc:  # noqa: BLE001
        return unreadable(evidence, f"could not load artifact: {exc}")

    if tools.calculate_hash(blob) != evidence.sha256:
        # The bytes changed after upload. Nothing read from them can be trusted.
        return unreadable(evidence, "content hash does not match the uploaded artifact")

    if evidence.type == EvidenceType.SENSOR_READING:
        return _sensor_reading(evidence, blob)

    context = job_context(state)
    errors: list[str] = []
    for tool in DISPATCH.get(evidence.type, ()):
        try:
            return tool(evidence, blob, context)
        except Exception as exc:  # noqa: BLE001 - fall through to the alternate
            log.warning("%s could not read %s: %s", tool.__name__, evidence.id, exc)
            errors.append(f"{tool.__name__}: {exc}")
    return unreadable(evidence, "; ".join(errors) or f"no reader for {evidence.type.value}")


def unreadable(evidence: Evidence, reason: str) -> Reading:
    """Human fallback. Confidence 0.0 guarantees a request, never a verification."""
    log.warning("evidence %s unreadable: %s", evidence.id, reason)
    return Reading(
        observations=[Observation(type="unreadable", confidence=0.0, detail=reason)],
        metadata={"extraction_failed": True, "extraction_error": reason},
    )


def job_context(state: JobState | None) -> dict[str, Any]:
    """The little the model needs to know: what job, which parts to look for."""
    if state is None:
        return {}
    return {
        "description": state.job.description,
        "parts": sorted({r.part_number for r in state.requirements if r.part_number}),
    }


def _load(evidence: Evidence) -> bytes:
    from infra.settings import get_object_store

    key = evidence.metadata.get("object_key")
    if not key:
        raise ValueError("artifact has no object key")
    return get_object_store().get(key)


def _sensor_reading(evidence: Evidence, blob: bytes) -> Reading:
    """Sensor payloads are already structured; no model needed."""
    import json

    try:
        data = json.loads(blob)
    except ValueError as exc:
        return unreadable(evidence, f"sensor payload is not JSON: {exc}")
    observations = [Observation(**o) for o in data.get("observations", [])]
    return Reading(observations=observations, metadata={"sensor": data.get("sensor")})
