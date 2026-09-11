"""Bedrock AgentCore Runtime entry point (PRD 15.1, 30).

Deploys the same workflow the Lambda worker runs, as an AgentCore agent:

    agentcore configure --entrypoint agents/agentcore_app.py
    agentcore launch

Invoke with {"job_id": "JOB-1842"}. The runtime supplies sessions, tracing and
scaling; FieldProof supplies the deterministic workflow. A pause for a human
ends the invocation - the next event starts a new one (PRD FR-12).
"""

from __future__ import annotations

from typing import Any

from bedrock_agentcore import BedrockAgentCoreApp

from agents.orchestrator import run_workflow

app = BedrockAgentCoreApp()


@app.entrypoint
def invoke(payload: dict[str, Any]) -> dict[str, Any]:
    job_id = payload.get("job_id")
    if not isinstance(job_id, str) or not job_id:
        raise ValueError("payload must include a job_id string")
    result = run_workflow(job_id, trigger=str(payload.get("trigger") or "agentcore"))
    return {
        "job_id": job_id,
        "outcome": result.outcome,
        "run_id": result.run_id,
        "steps": result.steps,
        "technician_requests": result.technician_requests,
        "supervisor_decisions": result.supervisor_decisions,
        "error": result.error,
    }


if __name__ == "__main__":
    app.run()
