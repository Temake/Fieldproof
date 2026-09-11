"""The ten critical invariants (PRD 32).

These are the tests that matter. Everything else in FieldProof is an
optimization; if one of these fails, the product is unsafe to ship.
"""

from __future__ import annotations

from domain.authorization import authorize
from domain.claims.compatibility import can_support, is_compatible
from domain.enums import (
    ActionType,
    ClaimType,
    ConflictSeverity,
    ConflictStatus,
    ConflictType,
    DecisionAction,
    EvidenceType,
    JobStatus,
    RequirementStatus,
)
from domain.models import Claim, Conflict, Evidence, Job, JobState, Requirement
from domain.reconciliation.engine import reconcile


def _state(**overrides) -> JobState:
    job = Job(
        id="JOB-T1",
        customer_id="CUS-1",
        technician_id="TECH-1",
        status=overrides.pop("status", JobStatus.VERIFIED),
        authorized_amount=300.0,
    )
    return JobState(job=job, **overrides)


def test_inv_001_cannot_close_with_blocking_conflict():
    """A job cannot close with unresolved blocking conflicts."""
    state = _state(
        conflicts=[
            Conflict(
                job_id="JOB-T1",
                type=ConflictType.QUANTITY_MISMATCH,
                severity=ConflictSeverity.BLOCKING,
                description="3 installed, 2 authorized",
            )
        ]
    )
    auth = authorize(ActionType.CLOSE_JOB, state)
    assert not auth.allowed
    assert auth.invariant == "INV-001"


def test_inv_002_required_requirement_cannot_be_skipped():
    """A required requirement cannot be silently skipped."""
    state = _state(
        requirements=[
            Requirement(
                job_id="JOB-T1",
                type="customer_signature",
                description="Customer signature",
                required=True,
                status=RequirementStatus.UNSUPPORTED,
            )
        ]
    )
    auth = authorize(ActionType.CLOSE_JOB, state)
    assert not auth.allowed
    assert auth.invariant == "INV-002"


def test_inv_003_incompatible_evidence_cannot_support_a_claim():
    """A receipt proves purchase, never installation (PRD 25)."""
    assert can_support(ClaimType.PART_PURCHASED, EvidenceType.RECEIPT)
    assert not can_support(ClaimType.PART_INSTALLED, EvidenceType.RECEIPT)
    assert not can_support(ClaimType.PART_INSTALLED, EvidenceType.VOICE_NOTE)
    assert not is_compatible(ClaimType.CUSTOMER_ACCEPTED, EvidenceType.SENSOR_READING)


def test_inv_003_reconciliation_ignores_incompatible_support():
    """An installation requirement is not verified by a receipt alone."""
    receipt = Evidence(
        job_id="JOB-T1",
        type=EvidenceType.RECEIPT,
        storage_url="x",
        sha256="a" * 64,
        uploaded_by="TECH-1",
    )
    state = _state(
        requirements=[
            Requirement(
                job_id="JOB-T1",
                type="installation_quantity",
                description="Install 2 x Filter A",
                expected_quantity=2,
                part_number="FILTER-A",
            )
        ],
        evidence=[receipt],
        claims=[
            Claim(
                job_id="JOB-T1",
                type=ClaimType.PART_INSTALLED,
                part_number="FILTER-A",
                quantity=2,
                confidence=0.99,
                source_evidence_id=receipt.id,
            )
        ],
    )
    result = reconcile(state)
    assert result.requirements[0].status != RequirementStatus.VERIFIED


def test_inv_004_financial_exception_needs_approval():
    """Financial exceptions cannot execute without authorization."""
    state = _state()
    assert not authorize(ActionType.INCREASE_INVOICE, state, amount=54.0).allowed
    assert authorize(ActionType.INCREASE_INVOICE, state, amount=54.0).invariant == "INV-004"

    state.job.max_additional_spend_without_approval = 100.0
    assert authorize(ActionType.INCREASE_INVOICE, state, amount=54.0).allowed


def test_inv_005_duplicate_events_do_not_duplicate_actions(store, hero_job):
    """Duplicate delivery must not duplicate a side effect."""
    from demo.loader import complete_job, submit_evidence
    from tools.evidence import request_technician_evidence

    submit_evidence(hero_job.job_id, hero_job.evidence, announce=False)
    complete_job(hero_job.job_id)

    state = store.get_state(hero_job.job_id)
    requirement = state.requirements[0]
    state.requirements[0].status = RequirementStatus.UNSUPPORTED
    store.save_requirements(hero_job.job_id, state.requirements)

    first = request_technician_evidence(
        hero_job.job_id, requirement_ids=[requirement.id], message="please send it"
    )
    second = request_technician_evidence(
        hero_job.job_id, requirement_ids=[requirement.id], message="please send it"
    )
    assert first.ok and not first.duplicate
    assert second.ok and second.duplicate

    from infra.settings import get_notifier

    assert len(get_notifier().sent) == 1


def test_inv_006_paused_workflow_resumes_exactly_once(store, hero_job):
    """A workflow waiting for approval must resume exactly once."""
    from agents.orchestrator import run_workflow
    from demo.loader import complete_job, submit_evidence
    from tools.decisions import resolve_decision

    submit_evidence(hero_job.job_id, hero_job.evidence, announce=False)
    complete_job(hero_job.job_id)
    run_workflow(hero_job.job_id)
    submit_evidence(hero_job.job_id, hero_job.followup_evidence, announce=False)
    run_workflow(hero_job.job_id)

    pending = store.get_state(hero_job.job_id).pending_decisions()
    assert len(pending) == 1
    decision_id = pending[0].id

    first = resolve_decision(decision_id, DecisionAction.APPROVE, decided_by="Sarah")
    second = resolve_decision(decision_id, DecisionAction.REJECT, decided_by="Sarah")
    assert not first.duplicate
    assert second.duplicate

    state = store.get_state(hero_job.job_id)
    resolved = next(d for d in state.decisions if d.id == decision_id)
    assert resolved.decision == DecisionAction.APPROVE


def test_inv_007_every_executed_action_emits_an_audit_event(store, hero_job):
    """Every executed action must generate an audit event."""
    from agents.orchestrator import run_workflow
    from demo.loader import complete_job, submit_evidence
    from domain.enums import EventType

    submit_evidence(hero_job.job_id, hero_job.evidence, announce=False)
    complete_job(hero_job.job_id)
    run_workflow(hero_job.job_id)

    events = store.get_state(hero_job.job_id).events
    assert any(e.type == EventType.EVIDENCE_REQUESTED for e in events)
    assert all(e.created_at is not None for e in events)


def test_inv_007_refusals_are_also_audited(store, hero_job):
    """A refused action is auditable too - silence would hide the boundary."""
    from domain.enums import EventType
    from tools.jobs import close_job

    result = close_job(hero_job.job_id)
    assert not result.ok

    events = store.get_state(hero_job.job_id).events
    assert any(e.type == EventType.ACTION_FAILED for e in events)


def test_inv_008_finalized_claims_retain_evidence_references(store, hero_job):
    """Every finalized claim must keep its supporting evidence references."""
    from agents.orchestrator import run_workflow
    from demo.loader import complete_job, submit_evidence

    submit_evidence(hero_job.job_id, hero_job.evidence, announce=False)
    complete_job(hero_job.job_id)
    run_workflow(hero_job.job_id)

    state = store.get_state(hero_job.job_id)
    assert state.claims
    linked = {link.claim_id for link in state.links}
    for claim in state.claims:
        assert claim.id in linked
        assert claim.source_evidence_id is not None


def test_inv_009_replacing_an_artifact_invalidates_its_conclusions(store, hero_job):
    """Deleting or replacing an artifact must invalidate dependent conclusions."""
    from agents.orchestrator import run_workflow
    from demo.loader import complete_job, submit_evidence
    from tools.evidence import supersede_evidence

    submit_evidence(hero_job.job_id, hero_job.evidence, announce=False)
    complete_job(hero_job.job_id)
    run_workflow(hero_job.job_id)

    state = store.get_state(hero_job.job_id)
    receipt = next(e for e in state.evidence if e.type == EvidenceType.RECEIPT)
    purchase_claims = [c for c in state.claims if c.source_evidence_id == receipt.id]
    assert purchase_claims

    supersede_evidence(hero_job.job_id, receipt.id, "EVID-REPLACEMENT")
    run_workflow(hero_job.job_id)

    state = store.get_state(hero_job.job_id)
    assert not [c for c in state.claims if c.source_evidence_id == receipt.id]


def test_inv_010_agent_output_cannot_bypass_policy():
    """Failed agent reasoning must never bypass deterministic policy rules."""
    state = _state(
        status=JobStatus.VERIFYING,
        requirements=[
            Requirement(
                job_id="JOB-T1",
                type="customer_signature",
                description="Customer signature",
                status=RequirementStatus.VERIFIED,
            )
        ],
        conflicts=[
            Conflict(
                job_id="JOB-T1",
                type=ConflictType.SPENDING_LIMIT_VIOLATION,
                severity=ConflictSeverity.BLOCKING,
                description="an agent decided this was fine",
                status=ConflictStatus.OPEN,
            )
        ],
    )
    # However confident an agent is, authorization is the only path to execution.
    assert not authorize(ActionType.CLOSE_JOB, state).allowed
    assert not authorize(ActionType.CREATE_INVOICE, state, additional_amount=54.0).allowed
