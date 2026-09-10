"""Shared FastAPI dependencies."""

from __future__ import annotations

from fastapi import HTTPException

from infra.adapters.memory_store import JobNotFound
from infra.settings import get_event_bus, get_notifier, get_object_store, get_store

__all__ = ["get_event_bus", "get_notifier", "get_object_store", "get_store", "load_state"]


def load_state(job_id: str):
    try:
        return get_store().get_state(job_id)
    except (JobNotFound, KeyError):
        raise HTTPException(status_code=404, detail=f"job {job_id} not found") from None
