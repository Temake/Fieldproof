"""DynamoDB JobStore (PRD 22 - single-table design).

Not required for the local demo. Implement against the same JobStore protocol
as MemoryJobStore so nothing above this layer changes.

Layout:
    PK = JOB#<job_id>
    SK = JOB | REQ#<id> | EVIDENCE#<id> | CLAIM#<id> | LINK#<claim>#<evidence>
         | CONFLICT#<id> | DECISION#<id> | EVENT#<iso8601>#<id>
    GSI1PK = STATUS#<job_status>   (dashboard queries)
    GSI2PK = DECISION#PENDING      (supervisor queue)

Idempotency keys live under PK = IDEM#<key> with a conditional write, which is
what makes INV-005 hold under duplicate event delivery.
"""

from __future__ import annotations

from typing import Any

from domain.models import (
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


class DynamoJobStore:
    def __init__(self, table_name: str, region: str | None = None) -> None:
        import boto3

        self.table = boto3.resource("dynamodb", region_name=region).Table(table_name)

    def create_job(self, job: Job, requirements: list[Requirement]) -> JobState:
        raise NotImplementedError("TODO: batch write JOB + REQ items")

    def get_state(self, job_id: str) -> JobState:
        raise NotImplementedError("TODO: query PK = JOB#<job_id>")

    def list_jobs(self, status: str | None = None) -> list[Job]:
        raise NotImplementedError("TODO: query GSI1")

    def save_job(self, job: Job) -> Job:
        raise NotImplementedError

    def save_requirements(self, job_id: str, requirements: list[Requirement]) -> None:
        raise NotImplementedError

    def add_evidence(self, evidence: Evidence) -> Evidence:
        raise NotImplementedError

    def save_evidence(self, evidence: Evidence) -> Evidence:
        raise NotImplementedError

    def replace_claims(
        self, job_id: str, claims: list[Claim], links: list[ClaimEvidenceLink]
    ) -> None:
        raise NotImplementedError

    def replace_conflicts(self, job_id: str, conflicts: list[Conflict]) -> None:
        raise NotImplementedError

    def save_conflict(self, conflict: Conflict) -> Conflict:
        raise NotImplementedError

    def add_decision(self, decision: Decision) -> Decision:
        raise NotImplementedError

    def save_decision(self, decision: Decision) -> Decision:
        raise NotImplementedError

    def get_decision(self, decision_id: str) -> Decision | None:
        raise NotImplementedError

    def append_event(self, event: Event) -> Event:
        raise NotImplementedError

    def list_events(self, job_id: str) -> list[Event]:
        raise NotImplementedError

    def claim_idempotency_key(self, key: str, result: Any = None) -> tuple[bool, Any]:
        """Conditional PutItem with attribute_not_exists(PK)."""
        raise NotImplementedError
