"""Fixture loading (PRD 37 - evaluation dataset).

A fixture is a whole scenario: the work order, the evidence the technician
submits, and any evidence that arrives later after FieldProof asks for it.
Loading one goes through the same tools the API uses, so a fixture run
exercises the real path rather than a shortcut.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from domain.enums import EventType, EvidenceType, JobStatus
from domain.events import make_event
from domain.models import Job, Requirement
from infra.settings import get_event_bus, get_store
from tools.evidence import upload_evidence
from tools.jobs import set_job_status

FIXTURE_DIR = Path(__file__).parent / "fixtures"


@dataclass
class Fixture:
    name: str
    description: str
    job: dict[str, Any]
    evidence: list[dict[str, Any]] = field(default_factory=list)
    followup_evidence: list[dict[str, Any]] = field(default_factory=list)
    expected: dict[str, Any] = field(default_factory=dict)

    @property
    def job_id(self) -> str:
        return self.job["id"]


def load_fixture(name: str) -> Fixture:
    path = name if str(name).endswith(".json") else FIXTURE_DIR / f"{name}.json"
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return Fixture(**data)


def list_fixtures() -> list[Fixture]:
    return [load_fixture(p) for p in sorted(FIXTURE_DIR.glob("*.json"))]


def create_job(fixture: Fixture) -> str:
    """Create the work order exactly as FR-01 describes."""
    spec = dict(fixture.job)
    requirements_spec = spec.pop("requirements", [])
    job = Job(**spec, status=JobStatus.IN_PROGRESS)
    requirements = [Requirement(job_id=job.id, **r) for r in requirements_spec]

    store = get_store()
    store.create_job(job, requirements)
    _publish(job.id, EventType.JOB_CREATED, "Work order created")
    return job.id


def submit_evidence(job_id: str, items: list[dict[str, Any]], *, announce: bool = True) -> list[str]:
    ids = []
    for item in items:
        evidence = upload_evidence(
            job_id,
            filename=item["filename"],
            data=item.get("text", "").encode("utf-8"),
            evidence_type=EvidenceType(item["type"]),
            uploaded_by=item["uploaded_by"],
            metadata=item.get("metadata", {}),
        )
        ids.append(evidence.id)
        if announce:
            _publish(
                job_id,
                EventType.EVIDENCE_UPLOADED,
                f"New {item['type']} received",
                actor=item["uploaded_by"],
                evidence_id=evidence.id,
            )
    return ids


def complete_job(job_id: str) -> None:
    """The technician clicks Complete Job (PRD 10)."""
    set_job_status(job_id, JobStatus.SUBMITTED)
    _publish(job_id, EventType.JOB_COMPLETED, "Technician completed job")


def _publish(job_id: str, type: EventType, message: str, **payload) -> None:
    event = get_store().append_event(make_event(job_id, type, message=message, **payload))
    get_event_bus().publish(event)
