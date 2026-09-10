"""Deterministic stand-ins for multimodal extraction.

Fixture artifacts declare what they depict in their metadata, so the whole
workflow is exercisable offline and the invariant tests stay fast and
repeatable. The real Evidence Agent produces the same Observation shape.
"""

from __future__ import annotations

from domain.enums import EvidenceType
from domain.models import Evidence, Observation

#: metadata key fixtures use to declare their intended reading.
FIXTURE_KEY = "fixture_reading"


def extract_stub(evidence: Evidence) -> tuple[list[Observation], str | None]:
    declared = evidence.metadata.get(FIXTURE_KEY)
    if declared:
        observations = [Observation(**o) for o in declared.get("observations", [])]
        return observations, declared.get("transcript")
    return _default_for_type(evidence), None


def _default_for_type(evidence: Evidence) -> list[Observation]:
    """Conservative fallback when a fixture declares nothing."""
    if evidence.type == EvidenceType.SIGNATURE:
        return [Observation(type="signature_present", confidence=0.97)]
    if evidence.type == EvidenceType.IMAGE:
        stage = evidence.metadata.get("stage")
        return [
            Observation(
                type="site_photo" if stage == "before" else "installed_component",
                confidence=0.75,
                detail="fallback reading - fixture declared no observations",
            )
        ]
    if evidence.type == EvidenceType.RECEIPT:
        return []
    return []


def observations_from_receipt(extraction) -> list[Observation]:
    """PRD FR-05 - receipt line items become purchase observations only."""
    out = [
        Observation(
            type="purchased_line_item",
            confidence=extraction.confidence,
            component=item.part_number or item.description,
            quantity=item.quantity,
            detail=f"{item.quantity} x {item.description}",
        )
        for item in extraction.line_items
    ]
    if extraction.total is not None:
        out.append(
            Observation(
                type="amount_paid",
                confidence=extraction.confidence,
                value=extraction.total,
                detail=f"receipt total {extraction.total}",
            )
        )
    return out
