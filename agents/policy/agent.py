"""Agent 4 - Policy Agent (PRD 16, 18).

Determines whether a discrepancy is AUTO_RESOLVE, REQUEST_EVIDENCE,
REQUIRE_HUMAN or BLOCK.

PRD 22: "The agent may interpret policy. The final authorization check must be
deterministic." So the verdict returned here comes from domain/policies/rules.py,
and the model only phrases the question a supervisor will read.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from pydantic import BaseModel, Field

from domain.enums import DecisionAction, PolicyOutcome
from domain.models import Conflict, JobState
from domain.policies.rules import PolicyRule, evaluate

log = logging.getLogger("fieldproof.policy")

SYSTEM_PROMPT = """You are the Policy Agent for FieldProof.

You are given a conflict and the policy rule that governs it. The verdict is
already decided. Your job is to phrase the question a supervisor must answer,
in one sentence, with the number that matters in it.

Good:  "Approve one additional Filter A at $54 outside the original scope?"
Bad:   "There appears to be a discrepancy which may require review."

Never invent a policy. Never soften a BLOCK.
"""


@dataclass
class PolicyVerdict:
    conflict_id: str
    outcome: PolicyOutcome
    rule: PolicyRule
    question: str
    recommended_action: DecisionAction
    financial_impact: float

    @property
    def needs_human(self) -> bool:
        return self.outcome in (PolicyOutcome.REQUIRE_HUMAN, PolicyOutcome.BLOCK)


def decide(conflict: Conflict, state: JobState) -> PolicyVerdict:
    """Deterministic verdict. The question is template-phrased here; the model
    is only consulted (via phrase_question) when a human will actually read it."""
    rule = evaluate(conflict, state)
    return PolicyVerdict(
        conflict_id=conflict.id,
        outcome=rule.outcome,
        rule=rule,
        question=_phrase_stub(conflict),
        recommended_action=rule.recommended_action or DecisionAction.REQUEST_CLARIFICATION,
        financial_impact=conflict.financial_impact,
    )


class SupervisorQuestion(BaseModel):
    question: str = Field(description="One sentence ending in a question mark")


def phrase_question(conflict: Conflict, rule: PolicyRule) -> str:
    """Model-phrased supervisor question, with the template as the floor.

    The model may improve the wording, but it may not drop the number that
    matters: if the financial impact is missing from its sentence, the
    template wins. Wording is never allowed to change what is being approved.
    """
    from agents.runtime import build_agent, stub_mode

    fallback = _phrase_stub(conflict)
    if stub_mode():
        return fallback
    prompt = (
        f"Conflict: {conflict.description}\n"
        f"Governing policy ({rule.id}): {rule.description}\n"
        f"Financial impact: {conflict.financial_impact:.2f}\n"
        "Write the question the supervisor must answer."
    )
    try:
        result = build_agent("policy", SYSTEM_PROMPT)(
            prompt, structured_output_model=SupervisorQuestion
        )
        question = result.structured_output.question.strip()
    except Exception as exc:  # noqa: BLE001 - phrasing is never worth failing a run
        log.warning("policy phrasing failed, using template: %s", exc)
        return fallback
    if not _keeps_the_numbers(question, conflict) or len(question) > 280:
        return fallback
    return question


def _keeps_the_numbers(question: str, conflict: Conflict) -> bool:
    if not conflict.financial_impact:
        return True
    plain = question.replace(",", "")
    amount = conflict.financial_impact
    return f"{amount:.2f}" in plain or (amount == int(amount) and f"{int(amount)}" in plain)


def _phrase_stub(conflict: Conflict) -> str:
    if conflict.financial_impact:
        return (
            f"{conflict.description} Approve the additional "
            f"{conflict.financial_impact:.2f}?"
        )
    return f"{conflict.description} How should this be resolved?"
