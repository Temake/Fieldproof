"""Event transport (PRD 19, 30).

Local mode runs handlers on a background thread so the API returns immediately
and the timeline fills in while the supervisor watches - the same asynchronous
shape EventBridge gives in production.
"""

from __future__ import annotations

import logging
import queue
import threading
from collections import defaultdict
from typing import Callable

from domain.models import Event

log = logging.getLogger("fieldproof.events")

Handler = Callable[[Event], None]


class InProcessEventBus:
    def __init__(self, *, synchronous: bool = False) -> None:
        self._handlers: dict[str, list[Handler]] = defaultdict(list)
        self._queue: queue.Queue[Event] = queue.Queue()
        self._synchronous = synchronous
        self._worker: threading.Thread | None = None
        self._stop = threading.Event()

    def subscribe(self, event_type: str, handler: Handler) -> None:
        self._handlers[str(event_type)].append(handler)

    def publish(self, event: Event) -> None:
        if self._synchronous:
            self._dispatch(event)
            return
        self._ensure_worker()
        self._queue.put(event)

    def _ensure_worker(self) -> None:
        if self._worker and self._worker.is_alive():
            return
        self._stop.clear()
        self._worker = threading.Thread(target=self._run, name="fieldproof-bus", daemon=True)
        self._worker.start()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                event = self._queue.get(timeout=0.25)
            except queue.Empty:
                continue
            self._dispatch(event)

    def _dispatch(self, event: Event) -> None:
        for handler in self._handlers.get(str(event.type), []):
            try:
                handler(event)
            except Exception:  # noqa: BLE001 - one bad handler must not kill the bus
                log.exception("handler failed for %s on %s", event.type, event.job_id)

    def drain(self, timeout: float = 10.0) -> None:
        """Block until the queue is empty. Used by tests and the demo runner."""
        deadline = threading.Event()
        threading.Timer(timeout, deadline.set).start()
        while not self._queue.empty() and not deadline.is_set():
            deadline.wait(0.05)

    def stop(self) -> None:
        self._stop.set()


class EventBridgeBus:
    """Amazon EventBridge adapter. Requires the aws extra (boto3)."""

    def __init__(self, bus_name: str, source: str = "fieldproof", region: str | None = None):
        import boto3

        self.bus_name = bus_name
        self.source = source
        self.client = boto3.client("events", region_name=region)

    def publish(self, event: Event) -> None:
        self.client.put_events(
            Entries=[
                {
                    "EventBusName": self.bus_name,
                    "Source": self.source,
                    "DetailType": str(event.type),
                    "Detail": event.model_dump_json(),
                }
            ]
        )

    def subscribe(self, event_type: str, handler: Handler) -> None:
        raise NotImplementedError(
            "EventBridge delivery is configured as infrastructure rules, not in code. "
            "See infra/aws/README.md."
        )
