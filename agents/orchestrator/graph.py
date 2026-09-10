"""Workflow orchestration (PRD 11, 17).

    START -> LOAD_CONTEXT -> PARSE_EVIDENCE -> RECONCILE -> POLICY_CHECK
              -> MISSING  -> REQUEST_EVIDENCE -> WAIT -> (re-enter PARSE_EVIDENCE)
              -> CONFLICT -> HUMAN_DECISION   -> PAUSE -> (re-enter RECONCILE)
              -> CLEAN    -> ACTION_AGENT     -> CLOSE_JOB

Orchestration is deterministic (PRD 15.2: "Avoid five agents independently
discussing the problem"). The workflow does not loop in memory waiting for a
technician or a supervisor - it returns, and an event re-enters it later
(PRD FR-12). That is what makes resumption survive a process restart.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from agents.action import agent as action_agent
from agents.context import load_context
from agents.evidence import analyze
from agents.policy import decide
from agents.reconciliation import run as reconcile_state
from domain.enums import EventType, JobStatus, PolicyOutcome, RequirementStatus
from domain.events import make_event
from domain.models import JobState
from infra.settings import get_event_bus, get_store
from tools.decisions import sync_conflicts
from tools.evidence import save_claims, save_observations
from tools.jobs import set_job_status

log = logging.getLogger("fieldproof.orchestrator")


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
    steps: list[str] = field(default_factory=list)
    autonomous_steps: int = 0
    technician_requests: int = 0
    supervisor_decisions: int = 0
    detail: dict[str, Any] = field(default_factory=dict)


def run_workflow(job_id: str) -> RunResult:
    """One pass of the closeout workflow.

    Returns when the job closes or when it is waiting on a human. Each pause is
    a real stop, not a sleep - the next event calls this function again.
    """
    store = get_store()
    result = RunResult(job_id=job_id, outcome="")

    _step(result, Node.LOAD_CONTEXT, job_id)
    context = load_context(job_id)
    _emit(job_id, EventType.AGENT_STEP_COMPLETED, "Loaded job context", node=Node.LOAD_CONTEXT)

    state = store.get_state(job_id)
    if state.job.status in (JobStatus.SUBMITTED, JobStatus.WAITING_FOR_EVIDENCE,
                            JobStatus.WAITING_FOR_DECISION):
        set_job_status(job_id, JobStatus.VERIFYING, message="FieldProof began verification")

    # -- PARSE_EVIDENCE ---------------------------------------------------
    _step(result, Node.PARSE_EVIDENCE, job_id)
    parsed = _parse_evidence(job_id)
    _emit(
        job_id,
        EventType.EVIDENCE_PROCESSED,
        f"{parsed['artifacts']} evidence artifacts processed",
        node=Node.PARSE_EVIDENCE,
        **parsed,
    )

    # -- RECONCILE --------------------------------------------------------
    _step(result, Node.RECONCILE, job_id)
    state = store.get_state(job_id)
    reconciliation = reconcile_state(state)
    store.save_requirements(job_id, reconciliation.requirements)
    sync_conflicts(job_id, reconciliation.conflicts)
    state = store.get_state(job_id)
    verified = sum(
        1 for r in state.required_requirements() if r.status == RequirementStatus.VERIFIED
    )
    _emit(
        job_id,
        EventType.AGENT_STEP_COMPLETED,
        f"{verified}/{len(state.required_requirements())} requirements verified",
        node=Node.RECONCILE,
    )

    # -- POLICY_CHECK -----------------------------------------------------
    _step(result, Node.POLICY_CHECK, job_id)
    verdicts = [decide(c, state) for c in state.open_conflicts()]

    # PRD 11 - "Can policy resolve automatically?" A conflict the policy layer
    # clears must actually be closed out, or it blocks the job forever.
    resolved = _auto_resolve(job_id, verdicts)
    if resolved:
        state = store.get_state(job_id)

    recoverable = [v for v in verdicts if v.outcome == PolicyOutcome.REQUEST_EVIDENCE]
    escalations = [v for v in verdicts if v.needs_human]

    # -- MISSING branch: recover before escalating (PRD G4) ---------------
    if recoverable:
        _step(result, Node.REQUEST_EVIDENCE, job_id)
        asks: dict[str, tuple[Any, Any]] = {}
        for verdict in recoverable:
            conflict = next(c for c in state.conflicts if c.id == verdict.conflict_id)
            requirement = next(
                (r for r in state.requirements if r.id == conflict.requirement_id), None
            )
            if requirement is not None:
                asks.setdefault(requirement.id, (requirement, conflict))

        if asks:
            # One message, however many things are missing. Two texts about the
            # same photo is how a technician learns to ignore the sender.
            message = action_agent.message_for_missing(
                [r for r, _ in asks.values()],
                state.job.technician_name,
                [c for _, c in asks.values()],
            )
            outcome = action_agent.request_evidence(state, list(asks), message)
            if outcome.ok and not outcome.duplicate:
                result.technician_requests += 1
        set_job_status(job_id, JobStatus.WAITING_FOR_EVIDENCE)
        result.outcome = "WAITING_FOR_EVIDENCE"
        return result

    # -- CONFLICT branch: one genuine human decision (PRD 12) -------------
    if escalations:
        _step(result, Node.HUMAN_DECISION, job_id)
        for verdict in escalations:
            conflict = next(c for c in state.conflicts if c.id == verdict.conflict_id)
            outcome = action_agent.escalate(
                state, verdict, evidence_ids=_evidence_for(state, conflict)
            )
            if outcome.ok and not outcome.duplicate:
                result.supervisor_decisions += 1
        set_job_status(job_id, JobStatus.WAITING_FOR_DECISION)
        result.outcome = "WAITING_FOR_DECISION"
        return result

    # -- CLEAN branch: finish the job ------------------------------------
    _step(result, Node.ACTION, job_id)
    set_job_status(job_id, JobStatus.VERIFIED, message="All requirements verified")
    _emit(job_id, EventType.JOB_VERIFIED, "Job verified", node=Node.ACTION)

    state = store.get_state(job_id)
    detail = action_agent.finalize(state)
    result.detail = {k: v.to_dict() if hasattr(v, "to_dict") else v for k, v in detail.items()}
    result.outcome = "CLOSED"
    _step(result, Node.DONE, job_id)
    return result


def _auto_resolve(job_id: str, verdicts: list) -> list[str]:
    """Close out every conflict the policy layer resolves without a human."""
    from domain.enums import ConflictStatus
    from domain.ids import utcnow

    store = get_store()
    state = store.get_state(job_id)
    resolved: list[str] = []
    for verdict in verdicts:
        if verdict.outcome != PolicyOutcome.AUTO_RESOLVE:
            continue
        conflict = next((c for c in state.conflicts if c.id == verdict.conflict_id), None)
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
        observations, transcript = analyze(evidence)
        save_observations(job_id, evidence.id, observations, transcript)

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


def _evidence_for(state: JobState, conflict) -> list[str]:
    """Evidence ids a supervisor needs to judge this conflict (PRD FR-10)."""
    ids = set(conflict.evidence_ids)
    for claim_id in conflict.claim_ids:
        claim = state.claim_by_id(claim_id)
        if claim and claim.source_evidence_id:
            ids.add(claim.source_evidence_id)
    if not ids:
        ids = {e.id for e in state.active_evidence()}
    return sorted(ids)


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
