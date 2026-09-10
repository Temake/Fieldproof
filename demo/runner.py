"""Scenario runner shared by the eval suite and the CLI (PRD 37).

Drives one fixture the whole way: submit, complete, recover missing evidence,
resolve any decision, close. Returns what actually happened so it can be
compared against what the fixture expected.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from domain.enums import DecisionAction, EventType, JobStatus
from infra.settings import get_notifier, get_store

from .loader import Fixture, complete_job, create_job, submit_evidence

MAX_PASSES = 6


@dataclass
class ScenarioOutcome:
    job_id: str
    family: str
    final_status: str = ""
    technician_requests: int = 0
    supervisor_decisions: int = 0
    financial_impact: float = 0.0
    final_amount: float | None = None
    passes: int = 0
    messages: list[str] = field(default_factory=list)

    def matches(self, expected: dict) -> list[str]:
        """Return a list of mismatches against a fixture's expectations."""
        problems = []
        checks = {
            "final_status": self.final_status,
            "technician_requests": self.technician_requests,
            "supervisor_decisions": self.supervisor_decisions,
            "financial_impact": self.financial_impact,
            "final_amount": self.final_amount,
        }
        for key, actual in checks.items():
            if key not in expected:
                continue
            if actual != expected[key]:
                problems.append(f"{key}: expected {expected[key]!r}, got {actual!r}")
        return problems


def run_scenario(fixture: Fixture, *, decision: DecisionAction | None = None) -> ScenarioOutcome:
    """Run one fixture to a terminal state.

    The loop mirrors reality rather than shortcutting it: the workflow is
    re-entered only when something new arrives, exactly as an event would do it.
    """
    from agents.orchestrator import run_workflow
    from tools.decisions import resolve_decision

    store = get_store()
    job_id = create_job(fixture)
    submit_evidence(job_id, fixture.evidence, announce=False)
    complete_job(job_id)

    followup_sent = False
    outcome = ScenarioOutcome(job_id=job_id, family=fixture.name)
    chosen = decision or DecisionAction(fixture.expected.get("decision", "APPROVE"))

    for _ in range(MAX_PASSES):
        outcome.passes += 1
        run_workflow(job_id)
        state = store.get_state(job_id)

        if state.job.status == JobStatus.WAITING_FOR_EVIDENCE:
            if followup_sent or not fixture.followup_evidence:
                break  # nothing more exists to supply - a legitimate stopping point
            submit_evidence(job_id, fixture.followup_evidence, announce=False)
            followup_sent = True
            continue

        if state.job.status == JobStatus.WAITING_FOR_DECISION:
            for pending in state.pending_decisions():
                resolve_decision(pending.id, chosen, decided_by="Sarah")
            continue

        if state.job.status == JobStatus.CLOSED:
            break

    state = store.get_state(job_id)
    events = state.events
    outcome.final_status = state.job.status.value
    outcome.technician_requests = sum(
        1 for e in events if e.type == EventType.EVIDENCE_REQUESTED
    )
    outcome.supervisor_decisions = sum(
        1 for e in events if e.type == EventType.DECISION_RESOLVED
    )
    outcome.financial_impact = round(sum(d.financial_impact for d in state.decisions), 2)
    outcome.final_amount = state.job.final_amount
    outcome.messages = [m.message for m in get_notifier().sent]
    return outcome
