"""Runtime configuration and adapter wiring (PRD 30, 34).

One place decides whether FieldProof runs on local adapters or on AWS. Nothing
else in the codebase reads the environment.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def _flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in ("0", "false", "no", "")


@dataclass(frozen=True)
class Settings:
    """Read from the environment when constructed, not when imported."""

    mode: str = field(default_factory=lambda: _env("FIELDPROOF_MODE", "local"))
    data_dir: Path = field(
        default_factory=lambda: Path(_env("FIELDPROOF_DATA_DIR", ".fieldproof-data"))
    )
    object_dir: Path = field(
        default_factory=lambda: Path(_env("FIELDPROOF_OBJECT_DIR", ".fieldproof-data/objects"))
    )
    aws_region: str = field(default_factory=lambda: _env("AWS_REGION", "us-east-1"))
    table_name: str = field(default_factory=lambda: _env("FIELDPROOF_TABLE_NAME", "fieldproof"))
    bucket_name: str = field(
        default_factory=lambda: _env("FIELDPROOF_BUCKET_NAME", "fieldproof-evidence")
    )
    event_bus: str = field(default_factory=lambda: _env("FIELDPROOF_EVENT_BUS", "fieldproof-bus"))
    bedrock_model_id: str = field(
        default_factory=lambda: _env(
            "BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
        )
    )
    bedrock_region: str = field(
        default_factory=lambda: _env("BEDROCK_REGION", _env("AWS_REGION", "us-east-1"))
    )
    stub_agents: bool = field(default_factory=lambda: _flag("FIELDPROOF_STUB_AGENTS", True))

    # -- API security (PRD 34) -------------------------------------------
    api_key: str = field(default_factory=lambda: _env("FIELDPROOF_API_KEY"))
    """When set, every /api route requires `Authorization: Bearer <key>`."""
    signing_secret: str = field(
        default_factory=lambda: _env("FIELDPROOF_SIGNING_SECRET") or secrets.token_hex(32)
    )
    """Signs local upload URLs. Random per process unless configured."""
    max_upload_bytes: int = field(
        default_factory=lambda: int(float(_env("FIELDPROOF_MAX_UPLOAD_MB", "20")) * 1024 * 1024)
    )
    upload_url_ttl_seconds: int = field(
        default_factory=lambda: int(_env("FIELDPROOF_UPLOAD_URL_TTL", "900"))
    )
    public_base_url: str = field(
        default_factory=lambda: _env("FIELDPROOF_PUBLIC_BASE_URL", "http://localhost:8000")
    )
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            o.strip()
            for o in _env("FIELDPROOF_CORS_ORIGINS", "http://localhost:3000").split(",")
            if o.strip()
        )
    )

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
    """Substitute adapters: store, object_store, event_bus, notifier, invoice_provider."""
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


def get_invoice_provider():
    if "invoice_provider" in _OVERRIDES:
        return _OVERRIDES["invoice_provider"]
    return _build_invoice_provider()


@lru_cache(maxsize=1)
def _build_invoice_provider():
    from .adapters.invoicing import SimulatedInvoiceProvider

    return SimulatedInvoiceProvider()


def reset_caches() -> None:
    """Forget the wired singletons and any overrides."""
    clear_overrides()
    for fn in (
        get_settings,
        _build_store,
        _build_object_store,
        _build_event_bus,
        _build_notifier,
        _build_invoice_provider,
    ):
        fn.cache_clear()
