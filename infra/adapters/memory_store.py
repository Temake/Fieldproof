"""In-memory / JSON-file JobStore (local mode).

Keys mirror the intended DynamoDB single-table layout (PRD 22) so the DynamoDB
adapter is a drop-in swap:

    PK = JOB#1842
    SK = JOB | REQ#001 | EVIDENCE#001 | CLAIM#001 | CONFLICT#001 |
         DECISION#001 | EVENT#<iso-timestamp>
"""

from __future__ import annotations

import threading
from pathlib import Path
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


class JobNotFound(KeyError):
    pass


class MemoryJobStore:
    """Thread-safe store with optional JSON persistence for demo restarts."""

    def __init__(self, data_dir: str | Path | None = None) -> None:
        self._lock = threading.RLock()
        self._states: dict[str, JobState] = {}
        self._idempotency: dict[str, Any] = {}
        self._dir = Path(data_dir) if data_dir else None
        if self._dir:
            self._dir.mkdir(parents=True, exist_ok=True)
            self._load_all()

    # -- persistence ------------------------------------------------------
    def _path(self, job_id: str) -> Path:
        assert self._dir is not None
        return self._dir / f"{job_id}.json"

    def _load_all(self) -> None:
        assert self._dir is not None
        for path in self._dir.glob("*.json"):
            try:
                self._states[path.stem] = JobState.model_validate_json(path.read_text("utf-8"))
            except Exception:  # noqa: BLE001 - a corrupt demo file must not block boot
                continue

    def _flush(self, job_id: str) -> None:
        if not self._dir:
            return
        state = self._states[job_id]
        self._path(job_id).write_text(state.model_dump_json(indent=2), encoding="utf-8")

    # -- jobs -------------------------------------------------------------
    def create_job(self, job: Job, requirements: list[Requirement]) -> JobState:
        with self._lock:
            state = JobState(job=job, requirements=list(requirements))
            self._states[job.id] = state
            self._flush(job.id)
            return state.model_copy(deep=True)

    def get_state(self, job_id: str) -> JobState:
        with self._lock:
            state = self._states.get(job_id)
            if state is None:
                raise JobNotFound(job_id)
            return state.model_copy(deep=True)

    def list_jobs(self, status: str | None = None) -> list[Job]:
        with self._lock:
            jobs = [s.job.model_copy(deep=True) for s in self._states.values()]
        if status:
            jobs = [j for j in jobs if j.status == status]
        return sorted(jobs, key=lambda j: j.created_at, reverse=True)

    def save_job(self, job: Job) -> Job:
        with self._lock:
            self._states[job.id].job = job.model_copy(deep=True)
            self._flush(job.id)
            return job

    def save_requirements(self, job_id: str, requirements: list[Requirement]) -> None:
        with self._lock:
            self._states[job_id].requirements = [r.model_copy(deep=True) for r in requirements]
            self._flush(job_id)

    # -- evidence ---------------------------------------------------------
    def add_evidence(self, evidence: Evidence) -> Evidence:
        with self._lock:
            self._states[evidence.job_id].evidence.append(evidence.model_copy(deep=True))
            self._flush(evidence.job_id)
            return evidence

    def save_evidence(self, evidence: Evidence) -> Evidence:
        with self._lock:
            items = self._states[evidence.job_id].evidence
            for i, existing in enumerate(items):
                if existing.id == evidence.id:
                    items[i] = evidence.model_copy(deep=True)
                    break
            else:
                items.append(evidence.model_copy(deep=True))
            self._flush(evidence.job_id)
            return evidence

    # -- claims and conflicts --------------------------------------------
    def replace_claims(
        self, job_id: str, claims: list[Claim], links: list[ClaimEvidenceLink]
    ) -> None:
        with self._lock:
            state = self._states[job_id]
            state.claims = [c.model_copy(deep=True) for c in claims]
            state.links = [link.model_copy(deep=True) for link in links]
            self._flush(job_id)

    def replace_conflicts(self, job_id: str, conflicts: list[Conflict]) -> None:
        """Replace open conflicts only; resolved ones are part of the audit trail."""
        with self._lock:
            state = self._states[job_id]
            resolved = [c for c in state.conflicts if c.status.value != "OPEN"]
            resolved_keys = {(c.type, c.requirement_id) for c in resolved}
            fresh = [c for c in conflicts if (c.type, c.requirement_id) not in resolved_keys]
            state.conflicts = resolved + [c.model_copy(deep=True) for c in fresh]
            self._flush(job_id)

    def save_conflict(self, conflict: Conflict) -> Conflict:
        with self._lock:
            items = self._states[conflict.job_id].conflicts
            for i, existing in enumerate(items):
                if existing.id == conflict.id:
                    items[i] = conflict.model_copy(deep=True)
                    break
            else:
                items.append(conflict.model_copy(deep=True))
            self._flush(conflict.job_id)
            return conflict

    # -- decisions --------------------------------------------------------
    def add_decision(self, decision: Decision) -> Decision:
        with self._lock:
            self._states[decision.job_id].decisions.append(decision.model_copy(deep=True))
            self._flush(decision.job_id)
            return decision

    def save_decision(self, decision: Decision) -> Decision:
        with self._lock:
            items = self._states[decision.job_id].decisions
            for i, existing in enumerate(items):
                if existing.id == decision.id:
                    items[i] = decision.model_copy(deep=True)
                    break
            else:
                items.append(decision.model_copy(deep=True))
            self._flush(decision.job_id)
            return decision

    def get_decision(self, decision_id: str) -> Decision | None:
        with self._lock:
            for state in self._states.values():
                for decision in state.decisions:
                    if decision.id == decision_id:
                        return decision.model_copy(deep=True)
        return None

    def list_decisions(self, status: str | None = None) -> list[Decision]:
        with self._lock:
            out = [d.model_copy(deep=True) for s in self._states.values() for d in s.decisions]
        if status:
            out = [d for d in out if d.status == status]
        return sorted(out, key=lambda d: d.created_at, reverse=True)

    # -- events and idempotency ------------------------------------------
    def append_event(self, event: Event) -> Event:
        with self._lock:
            self._states[event.job_id].events.append(event.model_copy(deep=True))
            self._flush(event.job_id)
            return event

    def list_events(self, job_id: str) -> list[Event]:
        with self._lock:
            return [e.model_copy(deep=True) for e in self._states[job_id].events]

    def claim_idempotency_key(self, key: str, result: Any = None) -> tuple[bool, Any]:
        """PRD 33 - first caller wins, later callers get the recorded result."""
        with self._lock:
            if key in self._idempotency:
                return False, self._idempotency[key]
            self._idempotency[key] = result
            return True, result

    def record_idempotent_result(self, key: str, result: Any) -> None:
        with self._lock:
            self._idempotency[key] = result

    def reset(self) -> None:
        """Test and demo helper."""
        with self._lock:
            self._states.clear()
            self._idempotency.clear()
            if self._dir:
                for path in self._dir.glob("*.json"):
                    path.unlink()
