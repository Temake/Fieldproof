"""Test wiring.

Every test runs against a fresh in-memory store with a synchronous event bus,
so the workflow is deterministic and no test can see another test's job.
"""

from __future__ import annotations

import os

import pytest

os.environ.setdefault("FIELDPROOF_MODE", "local")
os.environ.setdefault("FIELDPROOF_STUB_AGENTS", "1")
os.environ["FIELDPROOF_DATA_DIR"] = ""


@pytest.fixture(autouse=True)
def isolated_runtime(tmp_path):
    """Swap in clean adapters for the duration of one test."""
    import infra.settings as settings
    from infra.adapters.event_bus import InProcessEventBus
    from infra.adapters.memory_store import MemoryJobStore
    from infra.adapters.notifier import SimulatedNotifier
    from infra.adapters.object_store import LocalObjectStore

    store = MemoryJobStore()
    settings.override(
        store=store,
        # Synchronous so a test never races the workflow it just triggered.
        event_bus=InProcessEventBus(synchronous=True),
        object_store=LocalObjectStore(tmp_path / "objects"),
        notifier=SimulatedNotifier(),
    )
    yield store
    settings.clear_overrides()


@pytest.fixture
def store(isolated_runtime):
    return isolated_runtime


@pytest.fixture
def notifier():
    from infra.settings import get_notifier

    return get_notifier()


@pytest.fixture
def hero_job():
    """The PRD 12 scenario, created but not yet completed."""
    from demo.loader import create_job, load_fixture

    fixture = load_fixture("JOB-1842")
    create_job(fixture)
    return fixture
