"""Workflow safety regressions.

Each test pins a failure mode found in review: things that pass in the happy
demo but break the moment events arrive out of order, twice, or mid-pause.
"""

from __future__ import annotations

from agents.orchestrator import run_workflow
from demo.loader import complete_job, create_job, load_fixture, submit_evidence
from domain.enums import (
    ConflictStatus,
    DecisionAction,
    DecisionStatus,
    EventType,
    JobStatus,
)
from tools.decisions import resolve_decision
from tools.jobs import close_job


def _to_decision(store):
    """Drive the hero job to its supervisor decision and return the state."""
    fixture = load_fixture("JOB-1842")
    job_id = create_job(fixture)
    submit_evidence(job_id, fixture.evidence, announce=False)
    complete_job(job_id)
    run_workflow(job_id)
    submit_evidence(job_id, fixture.followup_evidence, announce=False)
    run_workflow(job_id)
    return fixture, store.get_state(job_id)


def test_refused_action_does_not_burn_its_idempotency_key(store):
    """A close refused early must still be able to succeed later (INV-005 done right)."""
    _, state = _to_decision(store)
    refused = close_job(state.job.id)
    assert not refused.ok

    decision = state.pending_decisions()[0]
    resolve_decision(decision.id, DecisionAction.APPROVE, decided_by="Sarah")
    run_workflow(state.job.id)

    assert store.get_state(state.job.id).job.status == JobStatus.CLOSED


def test_evidence_during_decision_pause_does_not_duplicate_the_decision(store):
    """New evidence while a supervisor is deciding must not ask them twice (INV-006)."""
    fixture, state = _to_decision(store)
    assert len(state.pending_decisions()) == 1

    submit_evidence(state.job.id, [fixture.evidence[3]], announce=False)  # signature again
    run_workflow(state.job.id)

    state = store.get_state(state.job.id)
    assert len(state.pending_decisions()) == 1
    assert len([d for d in state.decisions if d.status == DecisionStatus.PENDING]) == 1


def test_evidence_before_completion_does_not_start_the_workflow(store):
    """Uploads during the job are normal; verification starts at Complete Job."""
    fixture = load_fixture("JOB-1842")
    job_id = create_job(fixture)
    submit_evidence(job_id, fixture.evidence[:1], announce=False)

    result = run_workflow(job_id)

    assert result.outcome == "NOT_SUBMITTED"
    assert store.get_state(job_id).job.status == JobStatus.IN_PROGRESS


def test_closed_job_ignores_late_events(store):
    _, state = _to_decision(store)
    resolve_decision(state.pending_decisions()[0].id, DecisionAction.APPROVE, decided_by="Sarah")
    run_workflow(state.job.id)
    events_before = len(store.get_state(state.job.id).events)

    result = run_workflow(state.job.id)

    assert result.outcome == "CLOSED"
    assert len(store.get_state(state.job.id).events) == events_before


def test_request_clarification_asks_the_technician_instead_of_rejecting(store, notifier):
    """REQUEST_CLARIFICATION is not a quiet REJECT (PRD FR-11)."""
    _, state = _to_decision(store)
    sent_before = len(notifier.sent)
    decision = state.pending_decisions()[0]

    resolve_decision(
        decision.id,
        DecisionAction.REQUEST_CLARIFICATION,
        decided_by="Sarah",
        comment="Why was the third filter replaced?",
    )
    run_workflow(state.job.id)

    state = store.get_state(state.job.id)
    conflict = next(c for c in state.conflicts if c.id == decision.conflict_id)
    assert conflict.status == ConflictStatus.AWAITING_CLARIFICATION
    assert state.job.status == JobStatus.WAITING_FOR_EVIDENCE
    assert len(notifier.sent) == sent_before + 1
    assert "third filter" in notifier.sent[-1].message

    # Close must stay impossible until someone actually decides.
    assert not close_job(state.job.id).ok


def test_clarification_reply_goes_back_to_the_supervisor(store):
    _, state = _to_decision(store)
    decision = state.pending_decisions()[0]
    resolve_decision(decision.id, DecisionAction.REQUEST_CLARIFICATION, decided_by="Sarah")
    run_workflow(state.job.id)

    submit_evidence(
        state.job.id,
        [
            {
                "type": "voice_note",
                "filename": "why.m4a",
                "text": "It was cracked and leaking air.",
                "uploaded_by": "TECH-004",
            }
        ],
        announce=False,
    )
    run_workflow(state.job.id)

    state = store.get_state(state.job.id)
    assert state.job.status == JobStatus.WAITING_FOR_DECISION
    pending = state.pending_decisions()
    assert len(pending) == 1 and pending[0].id != decision.id


def test_tool_failure_releases_its_idempotency_key(store, monkeypatch):
    """A crash mid-action must not make the retry look like a duplicate."""
    from tools.reports import closeout

    _, state = _to_decision(store)
    resolve_decision(state.pending_decisions()[0].id, DecisionAction.APPROVE, decided_by="Sarah")

    calls = {"n": 0}
    original = closeout.billable_amount

    def flaky(s):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("invoice provider timed out")
        return original(s)

    monkeypatch.setattr(closeout, "billable_amount", flaky)
    run_workflow(state.job.id)
    run_workflow(state.job.id)

    state = store.get_state(state.job.id)
    assert state.job.status == JobStatus.CLOSED
    assert any(e.type == EventType.ACTION_FAILED for e in state.events)
