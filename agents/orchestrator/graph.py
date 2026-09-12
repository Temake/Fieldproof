"""Workflow orchestration (PRD 11, 17).

    START -> LOAD_CONTEXT -> PARSE_EVIDENCE -> RECONCILE -> POLICY_CHECK
              -> MISSING       -> REQUEST_EVIDENCE -> WAIT -> (re-enter)
              -> CONFLICT      -> HUMAN_DECISION   -> PAUSE -> (re-enter)
              -> CLARIFICATION -> ask technician   -> WAIT -> (re-enter)
              -> CLEAN         -> ACTION_AGENT     -> CLOSE_JOB

Orchestration is deterministic (PRD 15.2: "Avoid five agents independently
discussing the problem"). The workflow never loops in memory waiting for a
technician or a supervisor - it returns, and an event re-enters it later
(PRD FR-12). That is what makes resumption survive a process restart.

Every entry point is safe to call at any time and any number of times:

- a job that is not submitted yet, or already closed, is left untouched;
- only one run per job executes at once; an event that arrives mid-run is
  coalesced into exactly one follow-up run (INV-005, INV-006);
- every event a run emits carries its run id, and the run ends with a summary
  event recording steps, tools called, duration and outcome (PRD 35).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from agents.action import agent as action_agent
from agents.context import load_context
from agents.evidence import analyze
from agents.policy import decide, phrase_question
from agents.reconciliation import run as reconcile_state
from domain.enums import ConflictStatus, EventType, JobStatus, PolicyOutcome, RequirementStatus
from domain.events import current_run_id, idempotency_key, make_event
from domain.ids import new_id
from domain.models import Conflict, JobState
from infra.settings import get_event_bus, get_store
from tools.base import tools_called
from tools.decisions import sync_conflicts
from tools.evidence import save_claims, save_observations
from tools.jobs import set_job_status

log = logging.getLogger("fieldproof.orchestrator")

#: States a run may start from. Anything earlier is still field work; CLOSED is final.
RUNNABLE = frozenset(
    {
        JobStatus.SUBMITTED,
        JobStatus.VERIFYING,
        JobStatus.WAITING_FOR_EVIDENCE,
        JobStatus.WAITING_FOR_DECISION,
        JobStatus.VERIFIED,
        JobStatus.CLOSING,
        JobStatus.FAILED,
    }
)


class Node(StrEnum):
    LOAD_CONTEXT = "LOAD_CONTEXT"
    PARSE_EVIDENCE = "PARSE_EVIDENCE"
    RECONCILE = "RECONCILE"
    POLICY_CHECK = "POLICY_CHECK"
    REQUEST_EVIDENCE = "REQUEST_EVIDENCE"
    HUMAN_DECISION = "HUMAN_DECISION"
    ACTION = "ACTION"
    DONE = "DONE"


@dataclass
class RunResult:
    job_id: str
    outcome: str
    run_id: str | None = None
    steps: list[str] = field(default_factory=list)
    autonomous_steps: int = 0
    technician_requests: int = 0
    supervisor_decisions: int = 0
    error: str | None = None
    detail: dict[str, Any] = field(default_factory=dict)


def run_workflow(job_id: str, *, trigger: str | None = None) -> RunResult:
    """Advance a job as far as it can go without a human.

    Returns when the job closes or waits on someone. Each pause is a real stop,
    not a sleep - the next event calls this function again.
    """
    store = get_store()
    status = store.get_state(job_id).job.status
    if status == JobStatus.CLOSED:
        return RunResult(job_id=job_id, outcome="CLOSED")
    if status not in RUNNABLE:
        return RunResult(job_id=job_id, outcome="NOT_SUBMITTED")

    owner = new_id("RUN")
    if not store.try_acquire_run_lock(job_id, owner):
        # Another run is in flight; make sure it looks again when it finishes.
        store.request_rerun(job_id)
        return RunResult(job_id=job_id, outcome="QUEUED")

    try:
        run_id = owner
        while True:
            result = _run_once(job_id, run_id, trigger)
            if not store.take_rerun(job_id):
                return result
            run_id, trigger = new_id("RUN"), "coalesced"
    finally:
        store.release_run_lock(job_id, owner)


def _run_once(job_id: str, run_id: str, trigger: str | None) -> RunResult:
    run_token = current_run_id.set(run_id)
    calls_token = tools_called.set([])
    started = time.perf_counter()
    result = RunResult(job_id=job_id, outcome="", run_id=run_id)
    try:
        if get_store().get_state(job_id).job.status == JobStatus.CLOSED:
            result.outcome = "CLOSED"
            return result
        _executor()(job_id, result)
    except Exception as exc:
        log.exception("workflow run %s failed for %s", run_id, job_id)
        result.outcome, result.error = "FAILED", str(exc)
        _mark_failed(job_id, exc)
    finally:
        _record_run(job_id, run_id, trigger, result, tools_called.get() or [], started)
        tools_called.reset(calls_token)
        current_run_id.reset(run_token)
    return result


def _executor():
    """The runtime that sequences the steps.

    In-process by default; the Strands multi-agent graph when
    FIELDPROOF_ORCHESTRATOR=strands. Both drive the same step functions in the
    same order and read the same deterministic Branch, so the choice is a
    deployment decision, not a behavioural one (PRD 15.1).
    """
    from infra.settings import get_settings

    if get_settings().orchestrator == "strands":
        from .strands_graph import execute as strands_execute

        return strands_execute
    return _execute


@dataclass
class Branch:
    """What POLICY_CHECK decided.

    Deterministic: every field here comes from domain/policies, never from a
    model. Both orchestrators read the same object, which is what keeps the
    Strands graph and the in-process graph on the same rails.
    """

    recoverable: list = field(default_factory=list)
    escalations: list = field(default_factory=list)
    awaiting: list = field(default_factory=list)

    @property
    def is_clean(self) -> bool:
        return not (self.recoverable or self.escalations or self.awaiting)


# -- Steps ------------------------------------------------------------------
#
# One function per node in the topology. They are the unit both orchestrators
# execute: _execute below calls them in order, and strands_graph wraps each one
# in a Strands graph node. Keeping them here means there is exactly one
# implementation of the workflow, whichever runtime drives it.


def step_load_context(job_id: str) -> dict[str, Any]:
    context = load_context(job_id)
    _emit(job_id, EventType.AGENT_STEP_COMPLETED, "Loaded job context", node=Node.LOAD_CONTEXT)
    _begin_verification(job_id)
    _reopen_answered_clarifications(job_id)
    return {"requirements": len(context.get("requirements", []))}


def step_parse_evidence(job_id: str) -> dict[str, Any]:
    parsed = _parse_evidence(job_id)
    _emit(
        job_id,
        EventType.EVIDENCE_PROCESSED,
        f"{parsed['artifacts']} evidence artifacts processed",
        node=Node.PARSE_EVIDENCE,
        **parsed,
    )
    return parsed


def step_reconcile(job_id: str) -> dict[str, Any]:
    store = get_store()
    reconciliation = reconcile_state(store.get_state(job_id))
    store.save_requirements(job_id, reconciliation.requirements)
    cleared = sync_conflicts(job_id, reconciliation.conflicts)
    state = store.get_state(job_id)
    required = state.required_requirements()
    verified = sum(1 for r in required if r.status == RequirementStatus.VERIFIED)
    _emit(
        job_id,
        EventType.AGENT_STEP_COMPLETED,
        f"{verified}/{len(required)} requirements verified",
        node=Node.RECONCILE,
        cleared_conflicts=cleared,
    )
    return {"verified": verified, "required": len(required), "cleared_conflicts": cleared}


def step_policy_check(job_id: str) -> Branch:
    """Classify the job into exactly one branch. No side effects beyond auto-resolution."""
    store = get_store()
    state = store.get_state(job_id)
    verdicts = [decide(c, state) for c in state.open_conflicts()]
    # PRD 11 - "Can policy resolve automatically?" A conflict the policy layer
    # clears must actually be closed out, or it blocks the job forever.
    if _auto_resolve(job_id, verdicts):
        state = store.get_state(job_id)
    return Branch(
        recoverable=[v for v in verdicts if v.outcome == PolicyOutcome.REQUEST_EVIDENCE],
        escalations=[v for v in verdicts if v.needs_human],
        awaiting=[c for c in state.conflicts if c.status == ConflictStatus.AWAITING_CLARIFICATION],
    )


def step_request_evidence(job_id: str, branch: Branch, result: RunResult) -> str:
    """MISSING branch: recover before escalating (PRD G4)."""
    _request_missing(get_store().get_state(job_id), branch.recoverable, result)
    set_job_status(job_id, JobStatus.WAITING_FOR_EVIDENCE)
    return "WAITING_FOR_EVIDENCE"


def step_human_decision(job_id: str, branch: Branch, result: RunResult) -> str:
    """CONFLICT branch: one genuine human decision (PRD 12)."""
    _escalate(get_store().get_state(job_id), branch.escalations, result)
    set_job_status(job_id, JobStatus.WAITING_FOR_DECISION)
    return "WAITING_FOR_DECISION"


def step_clarify(job_id: str, branch: Branch, result: RunResult) -> str:
    """CLARIFICATION branch: the supervisor asked the technician something."""
    state = get_store().get_state(job_id)
    for conflict in branch.awaiting:
        decision = state.decision_by_id(conflict.resolution_decision_id or "")
        if decision is None:
            continue
        outcome = action_agent.clarify(state, decision, conflict)
        if outcome.ok and not outcome.duplicate:
            result.technician_requests += 1
    set_job_status(job_id, JobStatus.WAITING_FOR_EVIDENCE)
    return "WAITING_FOR_EVIDENCE"


def step_action(job_id: str, result: RunResult) -> str:
    """CLEAN branch: finish the job."""
    store = get_store()
    set_job_status(job_id, JobStatus.VERIFIED)
    _emit(job_id, EventType.JOB_VERIFIED, "Job verified", node=Node.ACTION)

    detail = action_agent.finalize(store.get_state(job_id))
    result.detail = {k: v.to_dict() if hasattr(v, "to_dict") else v for k, v in detail.items()}
    closed = store.get_state(job_id).job.status == JobStatus.CLOSED
    # A failed external action leaves the job VERIFIED for a retry (PRD 36).
    return "CLOSED" if closed else "VERIFIED"


def _execute(job_id: str, result: RunResult) -> None:
    """In-process orchestrator: the steps above, in order, with no runtime between them."""
    _step(result, Node.LOAD_CONTEXT, job_id)
    step_load_context(job_id)

    _step(result, Node.PARSE_EVIDENCE, job_id)
    step_parse_evidence(job_id)

    _step(result, Node.RECONCILE, job_id)
    step_reconcile(job_id)

    _step(result, Node.POLICY_CHECK, job_id)
    branch = step_policy_check(job_id)

    if branch.recoverable:
        _step(result, Node.REQUEST_EVIDENCE, job_id)
        result.outcome = step_request_evidence(job_id, branch, result)
        return

    if branch.escalations:
        _step(result, Node.HUMAN_DECISION, job_id)
        result.outcome = step_human_decision(job_id, branch, result)
        return

    if branch.awaiting:
        _step(result, Node.REQUEST_EVIDENCE, job_id)
        result.outcome = step_clarify(job_id, branch, result)
        return

    _step(result, Node.ACTION, job_id)
    result.outcome = step_action(job_id, result)
    if result.outcome == "CLOSED":
        _step(result, Node.DONE, job_id)


def _begin_verification(job_id: str) -> None:
    status = get_store().get_state(job_id).job.status
    if status == JobStatus.VERIFYING:
        return
    message = {
        JobStatus.SUBMITTED: "FieldProof began verification",
        JobStatus.WAITING_FOR_EVIDENCE: "Verification resumed",
        JobStatus.WAITING_FOR_DECISION: "Verification resumed",
        JobStatus.FAILED: "Verification retried",
    }.get(status)
    set_job_status(job_id, JobStatus.VERIFYING, message=message)


def _request_missing(state: JobState, recoverable: list, result: RunResult) -> None:
    asks: dict[str, tuple[Any, Conflict]] = {}
    for verdict in recoverable:
        conflict = state.conflict_by_id(verdict.conflict_id)
        requirement = next(
            (r for r in state.requirements if conflict and r.id == conflict.requirement_id), None
        )
        if requirement is not None and conflict is not None:
            asks.setdefault(requirement.id, (requirement, conflict))
    if not asks:
        return

    # One message, however many things are missing. Two texts about the same
    # photo is how a technician learns to ignore the sender.
    message = action_agent.message_for_missing(
        [r for r, _ in asks.values()],
        state.job.technician_name,
        [c for _, c in asks.values()],
    )
    # Keyed on the evidence the technician has supplied so far: if they
    # answer and the problem persists, they are asked again - once.
    key = idempotency_key(
        "request_evidence",
        state.job.id,
        "+".join(sorted(asks)),
        f"e{len(state.active_evidence())}",
    )
    outcome = action_agent.request_evidence(state, list(asks), message, idempotency_key=key)
    if outcome.ok and not outcome.duplicate:
        result.technician_requests += 1


def _escalate(state: JobState, escalations: list, result: RunResult) -> None:
    already_pending = {d.conflict_id for d in state.pending_decisions()}
    for verdict in escalations:
        if verdict.conflict_id in already_pending:
            continue  # the supervisor already has this question (INV-006)
        conflict = state.conflict_by_id(verdict.conflict_id)
        if conflict is None:
            continue
        verdict.question = phrase_question(conflict, verdict.rule)
        rounds = sum(1 for d in state.decisions if d.conflict_id == conflict.id)
        key = idempotency_key("create_decision", state.job.id, conflict.id, f"r{rounds}")
        outcome = action_agent.escalate(
            state, verdict, _evidence_for(state, conflict), idempotency_key=key
        )
        if outcome.ok and not outcome.duplicate:
            result.supervisor_decisions += 1


def _reopen_answered_clarifications(job_id: str) -> None:
    """Evidence that arrived after a clarification request puts the question back.

    The conflict returns to OPEN, reconciliation re-checks it, and if it still
    stands the supervisor gets a fresh decision with the new evidence attached.
    """
    store = get_store()
    state = store.get_state(job_id)
    for conflict in state.conflicts:
        if conflict.status != ConflictStatus.AWAITING_CLARIFICATION:
            continue
        decision = state.decision_by_id(conflict.resolution_decision_id or "")
        asked_at = decision.resolved_at if decision else None
        replies = [e for e in state.active_evidence() if asked_at and e.created_at > asked_at]
        if not replies:
            continue
        store.save_conflict(conflict.model_copy(update={"status": ConflictStatus.OPEN}))
        _emit(
            job_id,
            EventType.AGENT_STEP_COMPLETED,
            "Clarification received from technician",
            node=Node.LOAD_CONTEXT,
            conflict_id=conflict.id,
            evidence_ids=[e.id for e in replies],
        )


def _auto_resolve(job_id: str, verdicts: list) -> list[str]:
    """Close out every conflict the policy layer resolves without a human."""
    from domain.ids import utcnow

    store = get_store()
    state = store.get_state(job_id)
    resolved: list[str] = []
    for verdict in verdicts:
        if verdict.outcome != PolicyOutcome.AUTO_RESOLVE:
            continue
        conflict = state.conflict_by_id(verdict.conflict_id)
        if conflict is None:
            continue
        conflict.status = ConflictStatus.AUTO_RESOLVED
        conflict.policy_id = verdict.rule.id
        conflict.resolved_at = utcnow()
        store.save_conflict(conflict)
        resolved.append(conflict.id)
        _emit(
            job_id,
            EventType.AGENT_STEP_COMPLETED,
            f"Resolved automatically under {verdict.rule.id}: {conflict.description}",
            node=Node.POLICY_CHECK,
            conflict_id=conflict.id,
            policy_id=verdict.rule.id,
        )
    return resolved


def _parse_evidence(job_id: str) -> dict[str, Any]:
    """Extract observations from every unprocessed artifact, then rebuild claims.

    Claims are rebuilt from the full active evidence set on every pass, never
    appended to. A replaced artifact therefore cannot leave a stale claim
    behind (INV-009).
    """
    from domain.claims.normalize import claims_from_evidence, merge_claims

    store = get_store()
    state = store.get_state(job_id)

    for evidence in state.active_evidence():
        if evidence.processed_at is not None:
            continue
        reading = analyze(evidence, state)
        save_observations(
            job_id, evidence.id, reading.observations, reading.transcript, reading.metadata
        )
        if reading.metadata.get("extraction_failed"):
            _emit(
                job_id,
                EventType.ACTION_FAILED,
                f"Could not read {evidence.filename or evidence.id}; "
                "will ask for a clearer copy",
                node=Node.PARSE_EVIDENCE,
                evidence_id=evidence.id,
                error=reading.metadata.get("extraction_error"),
            )

    state = store.get_state(job_id)
    claims: list = []
    links: list = []
    for evidence in state.active_evidence():
        evidence_claims, evidence_links = claims_from_evidence(evidence)
        claims.extend(evidence_claims)
        links.extend(evidence_links)

    merged = merge_claims(claims)
    kept_ids = {c.id for c in merged}
    save_claims(job_id, merged, [link for link in links if link.claim_id in kept_ids])
    return {"artifacts": len(state.active_evidence()), "claims": len(merged)}


def _evidence_for(state: JobState, conflict: Conflict) -> list[str]:
    """Evidence ids a supervisor needs to judge this conflict (PRD FR-10).

    Includes anything the technician sent in answer to an earlier
    clarification on the same conflict.
    """
    ids = set(conflict.evidence_ids)
    for claim_id in conflict.claim_ids:
        claim = state.claim_by_id(claim_id)
        if claim and claim.source_evidence_id:
            ids.add(claim.source_evidence_id)
    for decision in state.decisions:
        if decision.conflict_id == conflict.id and decision.resolved_at:
            ids |= {e.id for e in state.active_evidence() if e.created_at > decision.resolved_at}
    if not ids:
        ids = {e.id for e in state.active_evidence()}
    return sorted(ids)


def _mark_failed(job_id: str, exc: Exception) -> None:
    try:
        state = get_store().get_state(job_id)
        if state.job.status != JobStatus.CLOSED:
            set_job_status(
                job_id,
                JobStatus.FAILED,
                message="Verification paused after an internal error; it will retry "
                "on the next event",
            )
    except Exception:
        log.exception("could not mark %s as failed", job_id)


def _record_run(
    job_id: str,
    run_id: str,
    trigger: str | None,
    result: RunResult,
    calls: list[str],
    started: float,
) -> None:
    """PRD 35 - workflow id, agent steps, input event, tools, duration, result, error."""
    if not result.steps and result.outcome == "CLOSED":
        return  # nothing ran
    failed = result.outcome == "FAILED"
    _emit(
        job_id,
        EventType.WORKFLOW_RUN_FAILED if failed else EventType.WORKFLOW_RUN_COMPLETED,
        None,
        node=Node.DONE,
        run_id=run_id,
        trigger=trigger,
        steps=result.steps,
        tools_called=calls,
        duration_ms=round((time.perf_counter() - started) * 1000, 1),
        outcome=result.outcome,
        error=result.error,
    )


def _step(result: RunResult, node: Node, job_id: str) -> None:
    result.steps.append(node.value)
    result.autonomous_steps += 1
    _emit(job_id, EventType.AGENT_STEP_STARTED, None, node=node)


def _emit(job_id: str, type: EventType, message: str | None, *, node: Node, **payload) -> None:
    """Observability doubles as product UI (PRD 35)."""
    store = get_store()
    event = store.append_event(
        make_event(job_id, type, message=message, node=node.value, **payload)
    )
    get_event_bus().publish(event)
