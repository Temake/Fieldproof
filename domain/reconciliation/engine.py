"""Reconciliation engine (PRD FR-07, FR-09, Agent 3).

Compares requirements vs claims vs evidence and produces requirement statuses
plus conflicts. Pure function of JobState - no I/O, no model calls. This is the
component the invariant tests target hardest.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime

from ..claims.compatibility import can_support
from ..enums import (
    UNRESOLVED_CONFLICT_STATES,
    ClaimType,
    ConflictSeverity,
    ConflictStatus,
    ConflictType,
    EvidenceType,
    RequirementStatus,
    RequirementType,
)
from ..models import Claim, Conflict, Evidence, JobState, Requirement
from ..policies.confidence import may_auto_verify

#: Which claim type satisfies which requirement type.
REQUIREMENT_CLAIM: dict[RequirementType, ClaimType] = {
    RequirementType.INSTALLATION_QUANTITY: ClaimType.PART_INSTALLED,
    RequirementType.CUSTOMER_SIGNATURE: ClaimType.CUSTOMER_ACCEPTED,
    RequirementType.PARTS_RECEIPT: ClaimType.PART_PURCHASED,
    RequirementType.TASK_COMPLETED: ClaimType.TASK_COMPLETED,
    RequirementType.PHOTO_BEFORE: ClaimType.SITE_VISITED,
    RequirementType.PHOTO_AFTER: ClaimType.PART_INSTALLED,
}

#: Requirements satisfied by the presence of an artifact of a given kind.
ARTIFACT_REQUIREMENTS: dict[RequirementType, EvidenceType] = {
    RequirementType.PHOTO_BEFORE: EvidenceType.IMAGE,
    RequirementType.PHOTO_AFTER: EvidenceType.IMAGE,
    RequirementType.CUSTOMER_SIGNATURE: EvidenceType.SIGNATURE,
    RequirementType.PARTS_RECEIPT: EvidenceType.RECEIPT,
    RequirementType.SAFETY_FORM: EvidenceType.PDF,
}

#: Photo requirements are stage-tagged on upload (before / after).
REQUIREMENT_STAGE: dict[RequirementType, str] = {
    RequirementType.PHOTO_BEFORE: "before",
    RequirementType.PHOTO_AFTER: "after",
}


@dataclass
class ReconciliationResult:
    requirements: list[Requirement] = field(default_factory=list)
    conflicts: list[Conflict] = field(default_factory=list)
    missing_requirement_ids: list[str] = field(default_factory=list)
    confidence_by_requirement: dict[str, float] = field(default_factory=dict)

    @property
    def all_required_verified(self) -> bool:
        return all(r.status == RequirementStatus.VERIFIED for r in self.requirements if r.required)

    @property
    def confidence(self) -> float:
        """Weakest link across required requirements."""
        scores = [
            self.confidence_by_requirement[r.id]
            for r in self.requirements
            if r.required and r.id in self.confidence_by_requirement
        ]
        return min(scores) if scores else 0.0


def reconcile(state: JobState) -> ReconciliationResult:
    """Recompute requirement statuses and conflicts from scratch.

    Recomputation is always full, never incremental: when an artifact is
    replaced (INV-009) previous conclusions must not survive.
    """
    result = ReconciliationResult()

    for requirement in state.requirements:
        updated = requirement.model_copy(deep=True)
        if not updated.required:
            updated.status = RequirementStatus.NOT_REQUIRED
            result.requirements.append(updated)
            continue

        conflicts = _evaluate_requirement(updated, state, result)
        result.requirements.append(updated)
        result.conflicts.extend(conflicts)
        if updated.status in (RequirementStatus.UNSUPPORTED, RequirementStatus.PARTIAL):
            result.missing_requirement_ids.append(updated.id)

    _price_conflicts(state, result.conflicts)
    result.conflicts.extend(detect_cross_cutting_conflicts(state, result))
    result.conflicts = _with_stable_ids(result.conflicts)
    return result


# -- conflict identity -------------------------------------------------------
#
# Reconciliation runs from scratch on every pass, so a conflict must be
# recognisable as "the same problem" across passes. Otherwise a supervisor who
# is mid-decision gets a second copy of the question the moment any new
# evidence lands (INV-006), and an approval can silently transfer to a
# different amount.
#
# The fingerprint therefore includes the observed and expected values: an
# approval for 3-against-2 does not cover 4-against-2.


def conflict_fingerprint(conflict: Conflict) -> str:
    parts = {
        "job": conflict.job_id,
        "type": conflict.type.value,
        "requirement": conflict.requirement_id,
        "expected": conflict.expected_value,
        "observed": conflict.observed_value,
    }
    if conflict.type == ConflictType.DUPLICATE_SUBMISSION:
        parts["evidence"] = sorted(conflict.evidence_ids)
    raw = json.dumps(parts, sort_keys=True, default=str)
    return "CON-" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:10].upper()


def _with_stable_ids(conflicts: list[Conflict]) -> list[Conflict]:
    seen: dict[str, Conflict] = {}
    for conflict in conflicts:
        conflict.id = conflict_fingerprint(conflict)
        seen.setdefault(conflict.id, conflict)
    return list(seen.values())


def merge_conflicts(
    existing: list[Conflict], fresh: list[Conflict], now: datetime
) -> tuple[list[Conflict], list[str]]:
    """Fold a fresh reconciliation pass into the stored conflict history.

    - still detected and open        -> refreshed in place, same id
    - still detected and decided     -> kept exactly as decided
    - no longer detected, unresolved -> CLEARED (kept for the audit trail)
    - newly detected                 -> added

    Returns the merged list and the ids that were cleared on this pass.
    """
    fresh_by_id = {c.id: c for c in fresh}
    merged: list[Conflict] = []
    cleared: list[str] = []

    for old in existing:
        new = fresh_by_id.pop(old.id, None)
        if new is None:
            if old.status in UNRESOLVED_CONFLICT_STATES:
                old = old.model_copy(
                    update={"status": ConflictStatus.CLEARED, "resolved_at": now}
                )
                cleared.append(old.id)
            merged.append(old)
        elif old.status == ConflictStatus.OPEN:
            merged.append(
                new.model_copy(update={"created_at": old.created_at, "policy_id": old.policy_id})
            )
        else:
            merged.append(old)

    merged.extend(fresh_by_id.values())
    return merged, cleared


def _price_conflicts(state: JobState, conflicts: list[Conflict]) -> None:
    """Attach the financial impact of out-of-scope work to its conflict.

    Without this a quantity mismatch would reach the policy layer with an
    impact of 0.00 and fall through the allowance carve-out (INV-004).
    """
    for conflict in conflicts:
        if conflict.type != ConflictType.QUANTITY_MISMATCH or conflict.financial_impact:
            continue
        requirement = next(
            (r for r in state.requirements if r.id == conflict.requirement_id), None
        )
        if requirement is None:
            continue
        extra = int(conflict.observed_value or 0) - int(conflict.expected_value or 0)
        if extra > 0:
            conflict.financial_impact = round(extra * _unit_price(state, requirement.part_number), 2)


def _requirement_for_part(state: JobState, part_number: str) -> str | None:
    for requirement in state.requirements:
        if requirement.part_number == part_number:
            return requirement.id
    return None


def _relevant_claims(state: JobState, claim_type: ClaimType, part: str | None) -> list[Claim]:
    return [
        c for c in state.claims if c.type == claim_type and (part is None or c.part_number == part)
    ]


def _tagged_evidence(state: JobState, kind: EvidenceType, stage: str | None) -> list[Evidence]:
    out: list[Evidence] = []
    for e in state.active_evidence():
        if e.type != kind:
            continue
        if stage and e.metadata.get("stage") not in (None, stage):
            continue
        out.append(e)
    return out


def _evaluate_requirement(
    requirement: Requirement, state: JobState, result: ReconciliationResult
) -> list[Conflict]:
    """Set requirement.status in place and return the conflicts it raises."""
    conflicts: list[Conflict] = []
    stage = REQUIREMENT_STAGE.get(requirement.type)

    # 1. Artifact-presence requirements: a signature, a receipt, a staged photo.
    if requirement.type in ARTIFACT_REQUIREMENTS and requirement.expected_quantity is None:
        artifacts = _tagged_evidence(state, ARTIFACT_REQUIREMENTS[requirement.type], stage)
        if not artifacts:
            requirement.status = RequirementStatus.UNSUPPORTED
            conflicts.append(
                _conflict(
                    requirement,
                    ConflictType.MISSING_ARTIFACT,
                    f"No {requirement.type.value} artifact was submitted.",
                )
            )
            return conflicts

        observations = [o for a in artifacts for o in a.observations]
        # Fail closed: an artifact nobody could read does not satisfy anything.
        confidence = max((o.confidence for o in observations), default=0.0)
        result.confidence_by_requirement[requirement.id] = confidence
        if not may_auto_verify(confidence):
            requirement.status = RequirementStatus.PARTIAL
            conflicts.append(
                _conflict(
                    requirement,
                    ConflictType.LOW_CONFIDENCE_EVIDENCE,
                    f"{requirement.type.value} evidence is only {confidence:.2f} confident, "
                    "below the auto-verification floor.",
                    evidence_ids=[a.id for a in artifacts],
                )
            )
            return conflicts

        requirement.status = RequirementStatus.VERIFIED
        artifact_ids = {a.id for a in artifacts}
        requirement.supporting_claim_ids = [
            c.id for c in state.claims if c.source_evidence_id in artifact_ids
        ]
        return conflicts

    # 2. Claim-backed requirements, including authorized quantities.
    claim_type = REQUIREMENT_CLAIM.get(requirement.type)
    if claim_type is None:
        requirement.status = RequirementStatus.UNSUPPORTED
        return conflicts

    claims = _relevant_claims(state, claim_type, requirement.part_number)
    active_ids = {e.id: e for e in state.active_evidence()}
    supported = [
        c
        for c in claims
        if c.source_evidence_id in active_ids
        and can_support(c.type, active_ids[c.source_evidence_id].type)
    ]

    if not supported:
        requirement.status = RequirementStatus.UNSUPPORTED
        conflicts.append(
            _conflict(
                requirement,
                ConflictType.UNSUPPORTED_COMPLETION_CLAIM
                if claims
                else ConflictType.MISSING_ARTIFACT,
                (
                    f"Claims exist but no compatible evidence supports: "
                    f"{requirement.description}."
                )
                if claims
                else f"Nothing submitted supports: {requirement.description}.",
                claim_ids=[c.id for c in claims],
            )
        )
        return conflicts

    observed = max((c.quantity or 0) for c in supported)
    confidence = max(c.confidence for c in supported)
    result.confidence_by_requirement[requirement.id] = confidence
    requirement.supporting_claim_ids = [c.id for c in supported]

    if not may_auto_verify(confidence):
        requirement.status = RequirementStatus.PARTIAL
        conflicts.append(
            _conflict(
                requirement,
                ConflictType.LOW_CONFIDENCE_EVIDENCE,
                f"Best supporting evidence for {requirement.description} is only "
                f"{confidence:.2f} confident.",
                claim_ids=[c.id for c in supported],
            )
        )
        return conflicts

    expected = requirement.expected_quantity
    if expected is None or observed == expected:
        requirement.status = RequirementStatus.VERIFIED
    elif observed < expected:
        requirement.status = RequirementStatus.PARTIAL
        conflicts.append(
            _conflict(
                requirement,
                ConflictType.UNSUPPORTED_COMPLETION_CLAIM,
                f"Only {observed} of {expected} confirmed for {requirement.description}.",
                claim_ids=[c.id for c in supported],
                expected=expected,
                observed=observed,
            )
        )
    else:
        # The work is verified as *performed*; it is the scope that is contested.
        requirement.status = RequirementStatus.VERIFIED
        requirement.notes = f"{observed} performed against {expected} authorized."
        conflicts.append(
            _conflict(
                requirement,
                ConflictType.QUANTITY_MISMATCH,
                f"{observed} units verified but only {expected} were authorized for "
                f"{requirement.description}.",
                claim_ids=[c.id for c in supported],
                expected=expected,
                observed=observed,
            )
        )
    return conflicts


def detect_cross_cutting_conflicts(
    state: JobState, result: ReconciliationResult
) -> list[Conflict]:
    """Conflicts that span requirements rather than belonging to one (FR-09)."""
    conflicts: list[Conflict] = []

    # Duplicate artifacts: same content hash uploaded twice (PRD 37).
    seen: dict[str, str] = {}
    for evidence in state.active_evidence():
        first = seen.get(evidence.sha256)
        if first is not None:
            conflicts.append(
                Conflict(
                    job_id=state.job.id,
                    type=ConflictType.DUPLICATE_SUBMISSION,
                    severity=ConflictSeverity.INFO,
                    description=f"{evidence.id} duplicates {first} (identical content hash).",
                    evidence_ids=[first, evidence.id],
                )
            )
        else:
            seen[evidence.sha256] = evidence.id

    # Purchased vs installed: a receipt never proves installation (PRD 25).
    for part, purchased in _quantities(state, ClaimType.PART_PURCHASED).items():
        installed = _quantities(state, ClaimType.PART_INSTALLED).get(part, 0)
        if purchased > installed:
            conflicts.append(
                Conflict(
                    job_id=state.job.id,
                    type=ConflictType.UNSUPPORTED_COMPLETION_CLAIM,
                    severity=ConflictSeverity.BLOCKING,
                    description=(
                        f"{purchased} x {part} purchased but only {installed} confirmed "
                        "installed by compatible evidence."
                    ),
                    requirement_id=_requirement_for_part(state, part),
                    expected_value=purchased,
                    observed_value=installed,
                )
            )

    # Spend above the pre-authorized allowance (INV-004). Skipped when a quantity
    # mismatch already accounts for the same money - the supervisor answers one
    # question, not two (PRD 12).
    additional = additional_spend(state)
    covered = any(
        c.type == ConflictType.QUANTITY_MISMATCH for c in result.conflicts
    )
    if not covered and additional > state.job.max_additional_spend_without_approval:
        conflicts.append(
            Conflict(
                job_id=state.job.id,
                type=ConflictType.SPENDING_LIMIT_VIOLATION,
                severity=ConflictSeverity.BLOCKING,
                description=(
                    f"Additional spend of {additional:.2f} exceeds the authorized "
                    f"allowance of {state.job.max_additional_spend_without_approval:.2f}."
                ),
                financial_impact=additional,
                expected_value=state.job.max_additional_spend_without_approval,
                observed_value=additional,
            )
        )

    return conflicts


def _quantities(state: JobState, claim_type: ClaimType) -> dict[str, int]:
    totals: dict[str, int] = {}
    for claim in state.claims:
        if claim.type != claim_type or claim.part_number is None:
            continue
        totals[claim.part_number] = max(totals.get(claim.part_number, 0), claim.quantity or 0)
    return totals


def additional_spend(state: JobState) -> float:
    """Cost of work performed beyond what the work order authorized."""
    total = 0.0
    for requirement in state.requirements:
        if requirement.type != RequirementType.INSTALLATION_QUANTITY:
            continue
        expected = requirement.expected_quantity or 0
        installed = _quantities(state, ClaimType.PART_INSTALLED).get(
            requirement.part_number or "", 0
        )
        extra = max(0, installed - expected)
        if extra:
            total += extra * _unit_price(state, requirement.part_number)
    return round(total, 2)


def _unit_price(state: JobState, part_number: str | None) -> float:
    """Unit price taken from receipt line items, 0.0 when unknown."""
    for evidence in state.active_evidence():
        for item in evidence.metadata.get("line_items", []):
            if part_number and item.get("part_number") != part_number:
                continue
            unit = item.get("unit_price")
            if unit:
                return float(unit)
            total, qty = item.get("total_price"), item.get("quantity")
            if total and qty:
                return round(float(total) / int(qty), 2)
    return 0.0


def _conflict(
    requirement: Requirement,
    type: ConflictType,
    description: str,
    *,
    claim_ids: list[str] | None = None,
    evidence_ids: list[str] | None = None,
    expected: object = None,
    observed: object = None,
    severity: ConflictSeverity = ConflictSeverity.BLOCKING,
) -> Conflict:
    return Conflict(
        job_id=requirement.job_id,
        type=type,
        severity=severity,
        description=description,
        requirement_id=requirement.id,
        claim_ids=claim_ids or [],
        evidence_ids=evidence_ids or [],
        expected_value=expected,
        observed_value=observed,
    )
