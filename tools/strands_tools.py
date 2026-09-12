"""FieldProof tools, exposed to Strands agents (PRD 18, 24).

The tools in this package are normally called by deterministic code. This
module publishes a subset of them as Strands `@tool` functions so a model can
*drive* the closeout itself - propose the action, call the tool, read the
result - which is what the SDK's tool loop is for.

That is safe here for one reason: authorization does not live in the prompt. A
tool call from a model goes through exactly the same path as a call from the
orchestrator - validate, `authorize()`, execute, emit an event - so a model
that proposes an illegal close gets a refusal with the invariant that stopped
it, and nothing happens to the job. The refusal is returned to the model as
data rather than raised, so the agent can read it and choose differently.

    from strands import Agent
    from tools.strands_tools import CLOSEOUT_TOOLS

    agent = Agent(tools=CLOSEOUT_TOOLS)
    agent("Close out JOB-1842.")

`scripts/agentic_closeout.py` runs exactly that against a seeded job and prints
which calls the policy layer allowed and which it refused.
"""

from __future__ import annotations

from typing import Any

from strands import tool

from domain.enums import DecisionAction


def _result(outcome: Any) -> dict[str, Any]:
    """Tool result as data the model can act on, never an exception."""
    return outcome.to_dict() if hasattr(outcome, "to_dict") else {"ok": True, "data": outcome}


@tool
def fieldproof_job_context(job_id: str) -> dict[str, Any]:
    """Read a work order: its requirements, their status, evidence and open conflicts.

    Start here. Nothing else tells you what the job still needs.

    Args:
        job_id: The work order id, e.g. JOB-1842.
    """
    from tools.jobs import get_job_context

    return _result(get_job_context(job_id))


@tool
def fieldproof_evidence(job_id: str, evidence_id: str) -> dict[str, Any]:
    """Read one evidence artifact: its type, observations and confidence.

    Returns a structured view. Raw bytes are never handed to an agent.

    Args:
        job_id: The work order id.
        evidence_id: The artifact id, from the job context.
    """
    from tools.evidence import get_evidence

    return _result(get_evidence(job_id, evidence_id))


@tool
def fieldproof_request_evidence(
    job_id: str, requirement_ids: list[str], message: str
) -> dict[str, Any]:
    """Ask the technician for missing artifacts. Send one message covering all of them.

    Args:
        job_id: The work order id.
        requirement_ids: Every requirement the technician must still satisfy.
        message: What to send. Name the artifact and say why it is needed.
    """
    from tools.evidence import request_technician_evidence

    return _result(
        request_technician_evidence(
            job_id, requirement_ids=list(requirement_ids), message=message
        )
    )


@tool
def fieldproof_request_decision(
    job_id: str,
    conflict_id: str,
    question: str,
    policy: str,
    recommended_action: str = "APPROVE",
    financial_impact: float = 0.0,
) -> dict[str, Any]:
    """Escalate one conflict to a supervisor as a single yes/no decision.

    Args:
        job_id: The work order id.
        conflict_id: The conflict being escalated, from the job context.
        question: One sentence the supervisor must answer, with the number in it.
        policy: The policy rule that requires a human, e.g. POL-003.
        recommended_action: APPROVE, REJECT or REQUEST_CLARIFICATION.
        financial_impact: Money at stake, 0.0 when none.
    """
    from tools.decisions import request_human_decision

    try:
        action = DecisionAction(recommended_action.upper())
    except ValueError:
        return {
            "ok": False,
            "action": "CREATE_DECISION",
            "job_id": job_id,
            "refused_reason": f"recommended_action must be one of "
            f"{[a.value for a in DecisionAction]}",
        }
    return _result(
        request_human_decision(
            job_id,
            conflict_id=conflict_id,
            question=question,
            recommended_action=action,
            policy=policy,
            financial_impact=financial_impact,
        )
    )


@tool
def fieldproof_generate_report(job_id: str) -> dict[str, Any]:
    """Produce the closeout report: what was done, with what parts, backed by what evidence.

    Args:
        job_id: The work order id.
    """
    from tools.reports import generate_closeout_report

    return _result(generate_closeout_report(job_id))


@tool
def fieldproof_prepare_invoice(job_id: str, additional_amount: float = 0.0) -> dict[str, Any]:
    """Invoice the job. Refused when additional work exceeds the approved allowance.

    Args:
        job_id: The work order id.
        additional_amount: Spend beyond the original scope, 0.0 when none.
    """
    from tools.reports import prepare_invoice

    return _result(prepare_invoice(job_id, additional_amount=additional_amount))


@tool
def fieldproof_close_job(job_id: str) -> dict[str, Any]:
    """Close the work order. Refused while any required evidence or conflict is outstanding.

    Args:
        job_id: The work order id.
    """
    from tools.jobs import close_job

    return _result(close_job(job_id))


#: Everything an agent needs to take a verified job through to closed.
CLOSEOUT_TOOLS = [
    fieldproof_job_context,
    fieldproof_evidence,
    fieldproof_request_evidence,
    fieldproof_request_decision,
    fieldproof_generate_report,
    fieldproof_prepare_invoice,
    fieldproof_close_job,
]

__all__ = ["CLOSEOUT_TOOLS"] + [t.__name__ for t in CLOSEOUT_TOOLS]
