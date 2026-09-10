"""Tool contract (PRD 24).

Never expose raw database access. Every tool must:

    1. validate inputs
    2. verify authorization
    3. execute the action
    4. emit an event
    5. return a structured result

`@fieldproof_tool` enforces 2, 4 and 5 so a tool body cannot forget them, and
carries the idempotency key so duplicate delivery is a no-op (PRD 33, INV-005,
INV-007).
"""

from __future__ import annotations

import functools
import logging
from dataclasses import dataclass, field
from typing import Any, Callable

from domain.authorization import NotAuthorized, require
from domain.enums import ActionType, EventType
from domain.events import make_event
from infra.settings import get_event_bus, get_store

log = logging.getLogger("fieldproof.tools")


@dataclass
class ToolResult:
    """What an agent sees. Never a raw database row."""

    ok: bool
    action: str
    job_id: str
    data: dict[str, Any] = field(default_factory=dict)
    message: str = ""
    duplicate: bool = False
    refused_reason: str | None = None
    invariant: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "action": self.action,
            "job_id": self.job_id,
            "data": self.data,
            "message": self.message,
            "duplicate": self.duplicate,
            "refused_reason": self.refused_reason,
            "invariant": self.invariant,
        }


def fieldproof_tool(
    action: ActionType,
    event_type: EventType,
    *,
    idempotent: bool = True,
):
    """Wrap a tool body with authorization, idempotency and audit emission.

    The wrapped function receives (state, **kwargs) and returns
    (data, message). It must not emit events or check authorization itself.
    """

    def decorator(fn: Callable[..., tuple[dict[str, Any], str]]):
        @functools.wraps(fn)
        def wrapper(job_id: str, **kwargs: Any) -> ToolResult:
            store = get_store()
            bus = get_event_bus()
            state = store.get_state(job_id)

            key = kwargs.pop("idempotency_key", None) or _default_key(action, job_id, kwargs)
            if idempotent:
                is_new, previous = store.claim_idempotency_key(key)
                if not is_new:
                    log.info("duplicate %s for %s (key=%s)", action.value, job_id, key)
                    return ToolResult(
                        ok=True,
                        action=action.value,
                        job_id=job_id,
                        data=previous or {},
                        message="already applied",
                        duplicate=True,
                    )

            try:
                require(action, state, **kwargs)
            except NotAuthorized as exc:
                # INV-010 - a refusal is itself auditable.
                bus.publish(
                    store.append_event(
                        make_event(
                            job_id,
                            EventType.ACTION_FAILED,
                            message=f"{action.value} refused: {exc.authorization.reason}",
                            action=action.value,
                            reason=exc.authorization.reason,
                            invariant=exc.authorization.invariant,
                        )
                    )
                )
                return ToolResult(
                    ok=False,
                    action=action.value,
                    job_id=job_id,
                    message=f"{action.value} refused",
                    refused_reason=exc.authorization.reason,
                    invariant=exc.authorization.invariant,
                )

            data, message = fn(state, **kwargs)

            if idempotent:
                store.record_idempotent_result(key, data)

            # Nested rather than splatted: a tool result may legitimately contain
            # keys like "message" that would collide with the event envelope.
            event = store.append_event(
                make_event(
                    job_id,
                    event_type,
                    message=message,
                    idempotency_key=key,
                    action=action.value,
                    result=data,
                )
            )
            bus.publish(event)
            return ToolResult(
                ok=True, action=action.value, job_id=job_id, data=data, message=message
            )

        wrapper.action = action  # type: ignore[attr-defined]
        return wrapper

    return decorator


def _default_key(action: ActionType, job_id: str, kwargs: dict[str, Any]) -> str:
    from domain.events import idempotency_key

    discriminators = []
    for name in ("requirement_id", "requirement_ids", "conflict_id", "decision_id"):
        value = kwargs.get(name)
        if not value:
            continue
        discriminators.append("+".join(sorted(value)) if isinstance(value, list) else str(value))
    return idempotency_key(action.value, job_id, *discriminators)
