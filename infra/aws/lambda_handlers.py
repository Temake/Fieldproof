"""AWS Lambda entry points (PRD 30).

    api_handler       API Gateway (HTTP API) -> FastAPI, via Mangum
    workflow_handler  EventBridge rule       -> run_workflow

In AWS mode nothing runs the workflow in-process. The API publishes domain
events to EventBridge; a rule matching the trigger events invokes
workflow_handler. Delivery is at-least-once, which is safe because
run_workflow is idempotent: guarded by job status, serialized by the
DynamoDB run lock, and every side effect carries an idempotency key.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("fieldproof.lambda")
logging.getLogger().setLevel(logging.INFO)

_api = None


def api_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    global _api
    if _api is None:
        from fieldproof_api.main import app
        from mangum import Mangum

        # Lifespan off: handler registration is an in-process concern; on AWS
        # the EventBridge rule is the subscription.
        _api = Mangum(app, lifespan="off")
    return _api(event, context)


def workflow_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    from agents.orchestrator import run_workflow

    detail = event.get("detail") or {}
    job_id = detail.get("job_id")
    if not isinstance(job_id, str) or not job_id:
        log.warning("ignoring event without a job_id: %s", event.get("id"))
        return {"skipped": True, "reason": "no job_id"}

    trigger = f"{event.get('detail-type', 'unknown')}:{detail.get('id', event.get('id'))}"
    result = run_workflow(job_id, trigger=trigger)
    log.info("job %s -> %s (run %s)", job_id, result.outcome, result.run_id)
    return {"job_id": job_id, "outcome": result.outcome, "run_id": result.run_id}
