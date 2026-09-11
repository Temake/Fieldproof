"""Observation -> Claim normalization (PRD FR-06).

The Evidence Agent returns loose observations. Everything downstream reasons
over claims, so normalization happens here in deterministic code rather than
inside a prompt.
"""

from __future__ import annotations

from ..enums import ClaimType, LinkRelationship
from ..models import Claim, ClaimEvidenceLink, Evidence
from .compatibility import can_support, is_compatible

#: Observation type produced by the Evidence Agent -> canonical claim type.
OBSERVATION_TO_CLAIM: dict[str, ClaimType] = {
    "installed_component": ClaimType.PART_INSTALLED,
    "purchased_line_item": ClaimType.PART_PURCHASED,
    "signature_present": ClaimType.CUSTOMER_ACCEPTED,
    "site_photo": ClaimType.SITE_VISITED,
    "amount_paid": ClaimType.PRICE_PAID,
    "spoken_statement": ClaimType.TECHNICIAN_STATEMENT,
    "task_completed": ClaimType.TASK_COMPLETED,
}


def claims_from_evidence(evidence: Evidence) -> tuple[list[Claim], list[ClaimEvidenceLink]]:
    """Turn one processed artifact into claims plus their evidence links."""
    claims: list[Claim] = []
    links: list[ClaimEvidenceLink] = []

    for obs in evidence.observations:
        claim_type = OBSERVATION_TO_CLAIM.get(obs.type)
        if claim_type is None:
            continue
        if not is_compatible(claim_type, evidence.type):
            # INV-003 - refuse to mint a claim this artifact cannot speak to.
            continue

        claim = Claim(
            job_id=evidence.job_id,
            type=claim_type,
            source_evidence_id=evidence.id,
            source=f"{evidence.type.value}:{evidence.uploaded_by}",
            part_number=obs.component,
            quantity=obs.quantity,
            amount=obs.value if obs.type == "amount_paid" else None,
            value=obs.value,
            confidence=obs.confidence,
        )
        claims.append(claim)
        links.append(
            ClaimEvidenceLink(
                claim_id=claim.id,
                evidence_id=evidence.id,
                relationship=(
                    LinkRelationship.SUPPORTS
                    if can_support(claim_type, evidence.type)
                    else LinkRelationship.PARTIALLY_SUPPORTS
                ),
                confidence=obs.confidence,
                rationale=obs.detail,
            )
        )
    return claims, links


def merge_claims(claims: list[Claim]) -> list[Claim]:
    """Collapse duplicate claims of the same type+part, keeping the strongest.

    Two photos of the same filter must not become two installations. Quantity
    is taken as the maximum confidently observed value, not the sum.
    """
    merged: dict[tuple[ClaimType, str | None], Claim] = {}
    for claim in claims:
        key = (claim.type, claim.part_number)
        current = merged.get(key)
        if current is None:
            merged[key] = claim.model_copy(deep=True)
            continue
        if (claim.quantity or 0) > (current.quantity or 0):
            current.quantity = claim.quantity
        current.confidence = max(current.confidence, claim.confidence)
    return list(merged.values())
