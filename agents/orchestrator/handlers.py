"""Event handlers that drive the workflow (PRD 19, FR-12).

Subscribing these to the bus is what makes FieldProof autonomous: nothing in
the UI ever calls run_workflow directly, and a resumption after a pause is the
same code path as the first run.
"""

from __future__ import annotations

import logging

from domain.enums import EventType
from domain.models import Event
from infra.settings import get_event_bus

from .graph import run_workflow

log = logging.getLogger("fieldproof.handlers")

#: Events that (re-)enter the workflow.
TRIGGERS = (
    EventType.JOB_COMPLETED,
    EventType.EVIDENCE_UPLOADED,
    EventType.DECISION_RESOLVED,
)


def on_trigger(event: Event) -> None:
    log.info("workflow triggered by %s on %s", event.type, event.job_id)
    try:
        run_workflow(event.job_id)
    except Exception:  # noqa: BLE001 - PRD 36, a failed run must not lose the job
        log.exception("workflow run failed for %s", event.job_id)


def register(bus=None) -> None:
    """Wire the handlers. Safe to call once per process."""
    bus = bus or get_event_bus()
    for event_type in TRIGGERS:
        bus.subscribe(str(event_type), on_trigger)
