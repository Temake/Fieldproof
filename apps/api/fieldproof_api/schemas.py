"""HTTP request/response shapes (PRD 23).

Kept separate from domain models: the wire format may add convenience fields
the domain has no opinion about.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from domain.enums import DecisionAction, EvidenceType, RequirementType


class RequirementIn(BaseModel):
    type: RequirementType
    description: str
    required: bool = True
    expected_quantity: int | None = None
    part_number: str | None = None


class JobIn(BaseModel):
    """PRD FR-01 - job intake."""

    id: str | None = None
    customer_id: str
    technician_id: str
    technician_name: str | None = None
    description: str = ""
    site_address: str | None = None
    authorized_amount: float = 0.0
    max_additional_spend_without_approval: float = 0.0
    requirements: list[RequirementIn] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvidenceIn(BaseModel):
    """JSON upload path used by fixtures and the demo runner."""

    type: EvidenceType
    filename: str
    content_base64: str | None = None
    text: str | None = None
    content_type: str | None = None
    uploaded_by: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class UploadUrlIn(BaseModel):
    """PRD 34 - request a signed upload URL."""

    filename: str
    content_type: str | None = None


class ConfirmUploadIn(BaseModel):
    """Register bytes uploaded through a signed URL."""

    key: str
    type: EvidenceType
    filename: str
    uploaded_by: str
    content_type: str | None = None
    stage: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DecisionIn(BaseModel):
    """PRD 23 - POST /api/decisions/:decisionId"""

    decision: DecisionAction
    comment: str | None = None
    decided_by: str = "supervisor"


class DashboardCounts(BaseModel):
    """PRD 14 Screen 1."""

    processing: int = 0
    closed_automatically: int = 0
    waiting_on_technician: int = 0
    decision_required: int = 0


class Metrics(BaseModel):
    """PRD 38 - the numbers the demo ends on."""

    workflow_steps: int = 0
    handled_autonomously: int = 0
    technician_interactions: int = 0
    supervisor_decisions: int = 0
    manual_document_reviews: int = 0
    automation_rate: float = 0.0
