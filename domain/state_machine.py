"""Job workflow state machine (PRD 20).

Transitions are data, not prose. The agent may *propose* a state change; only
this table can grant it.
"""

from __future__ import annotations

from .enums import JobStatus

S = JobStatus

TRANSITIONS: dict[JobStatus, frozenset[JobStatus]] = {
    S.OPEN: frozenset({S.IN_PROGRESS, S.FAILED}),
    S.IN_PROGRESS: frozenset({S.SUBMITTED, S.FAILED}),
    S.SUBMITTED: frozenset({S.VERIFYING, S.FAILED}),
    S.VERIFYING: frozenset(
        {
            S.WAITING_FOR_EVIDENCE,
            S.WAITING_FOR_DECISION,
            S.VERIFIED,
            S.FAILED,
        }
    ),
    # Both waiting states return to VERIFYING when their trigger arrives
    # (PRD FR-12 - workflow resumption).
    S.WAITING_FOR_EVIDENCE: frozenset({S.VERIFYING, S.FAILED}),
    S.WAITING_FOR_DECISION: frozenset({S.VERIFYING, S.FAILED}),
    S.VERIFIED: frozenset({S.CLOSING, S.WAITING_FOR_DECISION, S.FAILED}),
    # PRD 36 - a failed external action must not un-verify the job.
    S.CLOSING: frozenset({S.CLOSED, S.VERIFIED, S.FAILED}),
    S.CLOSED: frozenset(),
    S.FAILED: frozenset({S.VERIFYING}),
}

TERMINAL: frozenset[JobStatus] = frozenset({S.CLOSED})


class IllegalTransition(Exception):
    def __init__(self, current: JobStatus, target: JobStatus) -> None:
        super().__init__(f"illegal job transition {current} -> {target}")
        self.current = current
        self.target = target


def can_transition(current: JobStatus, target: JobStatus) -> bool:
    return target in TRANSITIONS.get(current, frozenset())


def assert_transition(current: JobStatus, target: JobStatus) -> None:
    """Raise unless the transition is allowed. Idempotent self-transitions pass."""
    if current == target:
        return
    if not can_transition(current, target):
        raise IllegalTransition(current, target)


def is_terminal(status: JobStatus) -> bool:
    return status in TERMINAL
