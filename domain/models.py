"""Core persisted objects (PRD 8 and PRD 21 - Data Model).

These models are the contract shared by the API, the tools, the agents and the
web client. Agents never touch storage directly; they exchange these shapes.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .enums import (
    ClaimStatus,
    ClaimType,
    ConflictSeverity,
    ConflictStatus,
    ConflictType,
    DecisionAction,
    DecisionStatus,
    EventType,
    EvidenceType,
    JobStatus,
    LinkRelationship,
    RequirementStatus,
    RequirementType,
)
from .ids import CLM, CON, DEC, EVID, EVT, REQ, new_id, utcnow


class Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Requirement(Base):
    """Something that must be true before the job can close (PRD 8.1)."""

    id: str = Field(default_factory=lambda: new_id(REQ))
    job_id: str
    type: RequirementType
    description: str
    required: bool = True
    status: RequirementStatus = RequirementStatus.UNSUPPORTED
    # Quantity requirements carry the authorized number, e.g. install 2 filters.
    expected_quantity: int | None = None
    part_number: str | None = None
    # Populated by the reconciliation engine - why the status is what it is.
    supporting_claim_ids: list[str] = Field(default_factory=list)
    notes: str | None = None


class Job(Base):
    """PRD 21 - Jobs."""

    id: str
    customer_id: str
    technician_id: str
    technician_name: str | None = None
    status: JobStatus = JobStatus.OPEN
    description: str = ""
    site_address: str | None = None
    authorized_amount: float = 0.0
    """Base amount authorized on the original work order."""
    max_additional_spend_without_approval: float = 0.0
    """PRD 9 - spending limit. Anything above this needs a human (INV-004)."""
    final_amount: float | None = None
    created_at: datetime = Field(default_factory=utcnow)
    completed_at: datetime | None = None
    closed_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Observation(Base):
    """A single machine-extracted fact about one artifact (PRD FR-03)."""

    type: str
    confidence: float = Field(ge=0.0, le=1.0)
    component: str | None = None
    quantity: int | None = None
    value: Any = None
    detail: str | None = None


class Evidence(Base):
    """PRD FR-02 / PRD 21 - Evidence."""

    id: str = Field(default_factory=lambda: new_id(EVID))
    job_id: str
    type: EvidenceType
    storage_url: str
    sha256: str
    uploaded_by: str
    filename: str | None = None
    content_type: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    processed_at: datetime | None = None
    observations: list[Observation] = Field(default_factory=list)
    transcript: str | None = None
    """Voice notes (FR-04) and documents keep their extracted text here."""
    superseded_by: str | None = None
    """INV-009: replacing an artifact must invalidate dependent conclusions."""
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReceiptLineItem(Base):
    """PRD FR-05 - structured receipt extraction."""

    description: str
    part_number: str | None = None
    quantity: int
    unit_price: float | None = None
    total_price: float | None = None


class ReceiptExtraction(Base):
    vendor: str | None = None
    line_items: list[ReceiptLineItem] = Field(default_factory=list)
    total: float | None = None
    date: datetime | None = None
    confidence: float = 0.0


class Claim(Base):
    """Something someone or something says happened (PRD 8.2)."""

    id: str = Field(default_factory=lambda: new_id(CLM))
    job_id: str
    type: ClaimType
    source_evidence_id: str | None = None
    source: str = "agent"
    part_number: str | None = None
    quantity: int | None = None
    amount: float | None = None
    value: Any = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    status: ClaimStatus = ClaimStatus.PROPOSED
    created_at: datetime = Field(default_factory=utcnow)


class ClaimEvidenceLink(Base):
    """PRD 21 - ClaimEvidenceLinks. A claim keeps its evidence refs (INV-008)."""

    claim_id: str
    evidence_id: str
    relationship: LinkRelationship
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str | None = None


class Conflict(Base):
    """A material incompatibility (PRD 8.4)."""

    id: str = Field(default_factory=lambda: new_id(CON))
    job_id: str
    type: ConflictType
    severity: ConflictSeverity
    description: str
    status: ConflictStatus = ConflictStatus.OPEN
    policy_id: str | None = None
    requirement_id: str | None = None
    claim_ids: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    financial_impact: float = 0.0
    expected_value: Any = None
    observed_value: Any = None
    created_at: datetime = Field(default_factory=utcnow)
    resolved_at: datetime | None = None
    resolution_decision_id: str | None = None


class Decision(Base):
    """A human resolution required before execution continues (PRD 8.5, 28)."""

    id: str = Field(default_factory=lambda: new_id(DEC))
    job_id: str
    conflict_id: str
    question: str
    recommended_action: DecisionAction
    policy: str
    policy_id: str | None = None
    financial_impact: float = 0.0
    evidence_ids: list[str] = Field(default_factory=list)
    requested_from: str = "supervisor"
    status: DecisionStatus = DecisionStatus.PENDING
    decision: DecisionAction | None = None
    comment: str | None = None
    decided_by: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    resolved_at: datetime | None = None


class Event(Base):
    """PRD 19 / PRD 21 - Events. Also the timeline UI feed (PRD 35)."""

    id: str = Field(default_factory=lambda: new_id(EVT))
    job_id: str
    type: EventType
    payload: dict[str, Any] = Field(default_factory=dict)
    message: str | None = None
    """Human-readable timeline line, e.g. 7 evidence artifacts processed."""
    actor: str = "fieldproof"
    idempotency_key: str | None = None
    created_at: datetime = Field(default_factory=utcnow)


class JobState(Base):
    """Everything under one job partition, loaded in a single read (PRD 22)."""

    job: Job
    requirements: list[Requirement] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)
    links: list[ClaimEvidenceLink] = Field(default_factory=list)
    conflicts: list[Conflict] = Field(default_factory=list)
    decisions: list[Decision] = Field(default_factory=list)
    events: list[Event] = Field(default_factory=list)

    def active_evidence(self) -> list[Evidence]:
        return [e for e in self.evidence if e.superseded_by is None]

    def open_conflicts(self) -> list[Conflict]:
        return [c for c in self.conflicts if c.status == ConflictStatus.OPEN]

    def blocking_conflicts(self) -> list[Conflict]:
        return [c for c in self.open_conflicts() if c.severity == ConflictSeverity.BLOCKING]

    def pending_decisions(self) -> list[Decision]:
        return [d for d in self.decisions if d.status == DecisionStatus.PENDING]

    def required_requirements(self) -> list[Requirement]:
        return [r for r in self.requirements if r.required]

    def evidence_by_id(self, evidence_id: str) -> Evidence | None:
        return next((e for e in self.evidence if e.id == evidence_id), None)

    def claim_by_id(self, claim_id: str) -> Claim | None:
        return next((c for c in self.claims if c.id == claim_id), None)
