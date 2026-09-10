"""Evidence compatibility matrix (PRD 25).

This is the technical heart of FieldProof: a receipt proves that three filters
were *purchased*. It does not prove that three filters were *installed*.

INV-003 - evidence cannot support a claim if its type is incompatible.
"""

from __future__ import annotations

from ..enums import ClaimType, EvidenceType

C = ClaimType
E = EvidenceType

#: Evidence types that can *establish* a claim of the given type.
SUPPORTING: dict[ClaimType, frozenset[EvidenceType]] = {
    C.PART_PURCHASED: frozenset({E.RECEIPT, E.PDF}),
    C.PART_INSTALLED: frozenset({E.IMAGE, E.VIDEO, E.SENSOR_READING}),
    C.CUSTOMER_ACCEPTED: frozenset({E.SIGNATURE, E.PDF}),
    C.SITE_VISITED: frozenset({E.IMAGE, E.VIDEO, E.SENSOR_READING}),
    C.PRICE_PAID: frozenset({E.RECEIPT, E.PDF}),
    C.TECHNICIAN_STATEMENT: frozenset({E.VOICE_NOTE, E.CHECKLIST}),
    C.TASK_COMPLETED: frozenset({E.IMAGE, E.VIDEO, E.CHECKLIST, E.SENSOR_READING}),
}

#: Evidence types that can *weaken but not establish* a claim. A voice note can
#: corroborate an installation; it can never verify one on its own.
CORROBORATING: dict[ClaimType, frozenset[EvidenceType]] = {
    C.PART_PURCHASED: frozenset({E.VOICE_NOTE, E.CHECKLIST, E.IMAGE}),
    C.PART_INSTALLED: frozenset({E.VOICE_NOTE, E.CHECKLIST, E.RECEIPT}),
    C.CUSTOMER_ACCEPTED: frozenset({E.VOICE_NOTE, E.IMAGE}),
    C.SITE_VISITED: frozenset({E.VOICE_NOTE, E.CHECKLIST}),
    C.PRICE_PAID: frozenset({E.VOICE_NOTE, E.CHECKLIST}),
    C.TECHNICIAN_STATEMENT: frozenset(),
    C.TASK_COMPLETED: frozenset({E.VOICE_NOTE, E.RECEIPT}),
}


def can_support(claim_type: ClaimType, evidence_type: EvidenceType) -> bool:
    """True when this evidence type is sufficient to verify this claim type."""
    return evidence_type in SUPPORTING.get(claim_type, frozenset())


def can_corroborate(claim_type: ClaimType, evidence_type: EvidenceType) -> bool:
    """True when this evidence type adds weight without being sufficient."""
    return evidence_type in CORROBORATING.get(claim_type, frozenset())


def is_compatible(claim_type: ClaimType, evidence_type: EvidenceType) -> bool:
    return can_support(claim_type, evidence_type) or can_corroborate(claim_type, evidence_type)


def explain(claim_type: ClaimType, evidence_type: EvidenceType) -> str:
    """Reviewer-facing sentence used on the decision card and receipt."""
    if can_support(claim_type, evidence_type):
        return f"{evidence_type.value} can establish {claim_type.value}"
    if can_corroborate(claim_type, evidence_type):
        return (
            f"{evidence_type.value} corroborates {claim_type.value} "
            f"but cannot establish it on its own"
        )
    return f"{evidence_type.value} is not valid evidence for {claim_type.value}"
