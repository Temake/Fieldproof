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

Ordering matters and is easy to get wrong:

    peek key   -> already applied? return the recorded result
    authorize  -> refused? audit it, but do NOT claim the key
    claim key  -> lost a race? return as duplicate
    execute    -> failed? release the key so a retry can run

Claiming before authorizing would let one early refusal permanently block the
same action once it becomes legal.
"""

from __future__ import annotations

import functools
import logging
from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

from domain.authorization import NotAuthorized, require
from domain.enums import ActionType, EventType
from domain.events import idempotency_key as make_key
from domain.events import make_event
from infra.settings import get_event_bus, get_store

log = logging.getLogger("fieldproof.tools")

#: Tool calls made during the current workflow run (PRD 35 - "tools called").
tools_called: ContextVar[list[str] | None] = ContextVar("fieldproof_tools_called", default=None)


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
    error: str | None = None

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
            "error": self.error,
        }


def note_tool_call(name: str) -> None:
    calls = tools_called.get()
    if calls is not None:
        calls.append(name)


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
            note_tool_call(fn.__name__)
            store = get_store()
            bus = get_event_bus()
            key = kwargs.pop("idempotency_key", None) or _default_key(action, job_id, kwargs)

            if idempotent:
                exists, previous = store.peek_idempotency(key)
                if exists:
                    return _duplicate(action, job_id, key, previous)

            state = store.get_state(job_id)
            try:
                require(action, state, **kwargs)
            except NotAuthorized as exc:
                # INV-010 - a refusal is itself auditable.
                _audit_failure(
                    job_id,
                    f"{action.value} refused: {exc.authorization.reason}",
                    action=action.value,
                    reason=exc.authorization.reason,
                    invariant=exc.authorization.invariant,
                )
                return ToolResult(
                    ok=False,
                    action=action.value,
                    job_id=job_id,
                    message=f"{action.value} refused",
                    refused_reason=exc.authorization.reason,
                    invariant=exc.authorization.invariant,
                )

            if idempotent:
                is_new, previous = store.claim_idempotency_key(key)
                if not is_new:
                    return _duplicate(action, job_id, key, previous)

            try:
                data, message = fn(state, **kwargs)
            except Exception as exc:
                if idempotent:
                    store.release_idempotency_key(key)
                log.exception("%s failed for %s", action.value, job_id)
                _audit_failure(
                    job_id,
                    f"{action.value} failed: {exc}",
                    action=action.value,
                    error=str(exc),
                )
                return ToolResult(
                    ok=False,
                    action=action.value,
                    job_id=job_id,
                    message=f"{action.value} failed",
                    error=str(exc),
                )

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


def _duplicate(action: ActionType, job_id: str, key: str, previous: Any) -> ToolResult:
    log.info("duplicate %s for %s (key=%s)", action.value, job_id, key)
    return ToolResult(
        ok=True,
        action=action.value,
        job_id=job_id,
        data=previous or {},
        message="already applied",
        duplicate=True,
    )


def _audit_failure(job_id: str, message: str, **payload: Any) -> None:
    store = get_store()
    event = store.append_event(make_event(job_id, EventType.ACTION_FAILED, message=message, **payload))
    get_event_bus().publish(event)


def _default_key(action: ActionType, job_id: str, kwargs: dict[str, Any]) -> str:
    discriminators = []
    for name in ("requirement_id", "requirement_ids", "conflict_id", "decision_id"):
        value = kwargs.get(name)
        if not value:
            continue
        discriminators.append("+".join(sorted(value)) if isinstance(value, list) else str(value))
    return make_key(action.value, job_id, *discriminators)
