"""Technician and customer messaging.

Simulated for the MVP (PRD 39). Messages are recorded so the timeline and the
demo can show exactly what FieldProof said, without an SMS provider.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from domain.ids import new_id

log = logging.getLogger("fieldproof.notifier")


@dataclass
class SentMessage:
    id: str
    recipient: str
    message: str
    context: dict


@dataclass
class SimulatedNotifier:
    sent: list[SentMessage] = field(default_factory=list)

    def send(self, recipient: str, message: str, **context) -> str:
        record = SentMessage(id=new_id("MSG"), recipient=recipient, message=message, context=context)
        self.sent.append(record)
        log.info("to %s: %s", recipient, message)
        return record.id

    def for_recipient(self, recipient: str) -> list[SentMessage]:
        return [m for m in self.sent if m.recipient == recipient]

    def for_job(self, job_id: str) -> list[SentMessage]:
        return [m for m in self.sent if m.context.get("job_id") == job_id]
