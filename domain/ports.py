"""Ports the rest of the system depends on (PRD 30).

Local adapters back these for development and the demo; the AWS adapters swap
in DynamoDB, S3 and EventBridge without any caller changing.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from .models import (
    Claim,
    ClaimEvidenceLink,
    Conflict,
    Decision,
    Event,
    Evidence,
    Job,
    JobState,
    Requirement,
)


@runtime_checkable
class JobStore(Protocol):
    """One partition per job (PRD 22 - single-table layout)."""

    def create_job(self, job: Job, requirements: list[Requirement]) -> JobState: ...

    def get_state(self, job_id: str) -> JobState: ...

    def list_jobs(self, status: str | None = None) -> list[Job]: ...

    def save_job(self, job: Job) -> Job: ...

    def save_requirements(self, job_id: str, requirements: list[Requirement]) -> None: ...

    def add_evidence(self, evidence: Evidence) -> Evidence: ...

    def save_evidence(self, evidence: Evidence) -> Evidence: ...

    def replace_claims(
        self, job_id: str, claims: list[Claim], links: list[ClaimEvidenceLink]
    ) -> None: ...

    def replace_conflicts(self, job_id: str, conflicts: list[Conflict]) -> None: ...

    def save_conflict(self, conflict: Conflict) -> Conflict: ...

    def add_decision(self, decision: Decision) -> Decision: ...

    def save_decision(self, decision: Decision) -> Decision: ...

    def get_decision(self, decision_id: str) -> Decision | None: ...

    def append_event(self, event: Event) -> Event: ...

    def list_events(self, job_id: str) -> list[Event]: ...

    def claim_idempotency_key(self, key: str, result: Any = None) -> tuple[bool, Any]:
        """Reserve an idempotency key (PRD 33).

        Returns (is_new, existing_result). Repeated calls return the result the
        first call recorded, so duplicate delivery cannot duplicate a side
        effect (INV-005).
        """
        ...


@runtime_checkable
class ObjectStore(Protocol):
    """Evidence bytes - local filesystem or S3."""

    def put(self, key: str, data: bytes, content_type: str | None = None) -> str: ...

    def get(self, key: str) -> bytes: ...

    def signed_url(self, key: str, expires_in: int = 900) -> str: ...


@runtime_checkable
class EventBus(Protocol):
    """Asynchronous workflow continuation - in-process or EventBridge."""

    def publish(self, event: Event) -> None: ...

    def subscribe(self, event_type: str, handler: Any) -> None: ...


@runtime_checkable
class Notifier(Protocol):
    """Technician / customer messaging. Simulated for the MVP (PRD 39)."""

    def send(self, recipient: str, message: str, **context: Any) -> str: ...
