"""Event construction and idempotency (PRD 19, 33, 35).

Duplicate delivery is expected in an event-driven workflow, so every
side-effecting operation derives a stable key and the store refuses to apply
the same key twice (INV-005, INV-006).
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any

from .enums import EventType
from .models import Event

#: The workflow run currently executing, if any. Every event created inside a
#: run is stamped with it so a run can be reconstructed from events alone.
current_run_id: ContextVar[str | None] = ContextVar("fieldproof_run_id", default=None)


def make_event(
    job_id: str,
    type: EventType,
    *,
    message: str | None = None,
    actor: str = "fieldproof",
    idempotency_key: str | None = None,
    **payload: Any,
) -> Event:
    return Event(
        job_id=job_id,
        type=type,
        message=message,
        actor=actor,
        idempotency_key=idempotency_key,
        run_id=current_run_id.get(),
        payload=payload,
    )


def idempotency_key(action: str, job_id: str, *parts: str, version: str = "v1") -> str:
    """Stable key for a side effect, e.g. close_job:JOB-1842:v1 (PRD 33)."""
    segments = [action, job_id, *parts, version]
    return ":".join(s for s in segments if s)


class DuplicateAction(Exception):
    """Raised (or swallowed by the caller) when an idempotency key repeats."""

    def __init__(self, key: str, existing_result: Any = None) -> None:
        super().__init__(f"duplicate action for idempotency key {key}")
        self.key = key
        self.existing_result = existing_result
