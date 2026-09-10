"""Runtime configuration and adapter wiring (PRD 30, 34).

One place decides whether FieldProof runs on local adapters or on AWS. Nothing
else in the codebase reads the environment.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Settings:
    mode: str = os.getenv("FIELDPROOF_MODE", "local")
    data_dir: Path = Path(os.getenv("FIELDPROOF_DATA_DIR", ".fieldproof-data"))
    object_dir: Path = Path(os.getenv("FIELDPROOF_OBJECT_DIR", ".fieldproof-data/objects"))
    aws_region: str = os.getenv("AWS_REGION", "us-east-1")
    table_name: str = os.getenv("FIELDPROOF_TABLE_NAME", "fieldproof")
    bucket_name: str = os.getenv("FIELDPROOF_BUCKET_NAME", "fieldproof-evidence")
    event_bus: str = os.getenv("FIELDPROOF_EVENT_BUS", "fieldproof-bus")
    bedrock_model_id: str = os.getenv(
        "BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    )
    bedrock_region: str = os.getenv("BEDROCK_REGION", os.getenv("AWS_REGION", "us-east-1"))
    stub_agents: bool = os.getenv("FIELDPROOF_STUB_AGENTS", "1") not in ("0", "false", "False")

    @property
    def is_local(self) -> bool:
        return self.mode == "local"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


#: Explicit overrides, used by tests and the demo runner. Checked before the
#: cached builders so that callers which imported get_store() by reference
#: still see the substituted adapter.
_OVERRIDES: dict[str, Any] = {}


def override(**adapters: Any) -> None:
    """Substitute adapters for this process (store, object_store, event_bus, notifier)."""
    _OVERRIDES.update({k: v for k, v in adapters.items() if v is not None})


def clear_overrides() -> None:
    _OVERRIDES.clear()


def get_store():
    """The JobStore for this process."""
    if "store" in _OVERRIDES:
        return _OVERRIDES["store"]
    return _build_store()


@lru_cache(maxsize=1)
def _build_store():
    settings = get_settings()
    if settings.is_local:
        from .adapters.memory_store import MemoryJobStore

        return MemoryJobStore(settings.data_dir / "jobs")
    from .adapters.dynamodb_store import DynamoJobStore

    return DynamoJobStore(settings.table_name, region=settings.aws_region)


def get_object_store():
    if "object_store" in _OVERRIDES:
        return _OVERRIDES["object_store"]
    return _build_object_store()


@lru_cache(maxsize=1)
def _build_object_store():
    settings = get_settings()
    if settings.is_local:
        from .adapters.object_store import LocalObjectStore

        return LocalObjectStore(settings.object_dir)
    from .adapters.object_store import S3ObjectStore

    return S3ObjectStore(settings.bucket_name, region=settings.aws_region)


def get_event_bus():
    if "event_bus" in _OVERRIDES:
        return _OVERRIDES["event_bus"]
    return _build_event_bus()


@lru_cache(maxsize=1)
def _build_event_bus():
    settings = get_settings()
    if settings.is_local:
        from .adapters.event_bus import InProcessEventBus

        return InProcessEventBus()
    from .adapters.event_bus import EventBridgeBus

    return EventBridgeBus(settings.event_bus, region=settings.aws_region)


def get_notifier():
    if "notifier" in _OVERRIDES:
        return _OVERRIDES["notifier"]
    return _build_notifier()


@lru_cache(maxsize=1)
def _build_notifier():
    from .adapters.notifier import SimulatedNotifier

    return SimulatedNotifier()


def reset_caches() -> None:
    """Forget the wired singletons and any overrides."""
    clear_overrides()
    for fn in (
        get_settings,
        _build_store,
        _build_object_store,
        _build_event_bus,
        _build_notifier,
    ):
        fn.cache_clear()
