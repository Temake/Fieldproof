"""Prefixed identifier helpers.

Identifiers are human-readable on purpose: they appear in the timeline, the
decision card and the audit receipt, and reviewers must be able to follow a
reference by eye (PRD 29).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

JOB = "JOB"
REQ = "REQ"
EVID = "EVID"
CLM = "CLM"
CON = "CON"
DEC = "DEC"
EVT = "EVT"
RCP = "RCP"


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"


def receipt_id_for(job_id: str) -> str:
    """Receipts are 1:1 with jobs, so the id is derived rather than random."""
    return f"{RCP}-{job_id.removeprefix(JOB + '-')}"


def utcnow() -> datetime:
    return datetime.now(UTC)


def utcnow_iso() -> str:
    return utcnow().isoformat()
