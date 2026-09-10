"""Agent 4 - Policy Agent (PRD 16, 18).

Determines whether a discrepancy is AUTO_RESOLVE, REQUEST_EVIDENCE,
REQUIRE_HUMAN or BLOCK.

PRD 22: "The agent may interpret policy. The final authorization check must be
deterministic." So the verdict returned here comes from domain/policies/rules.py,
and the model only phrases the question a supervisor will read.
"""

from __future__ import annotations

from dataclasses import dataclass

from domain.enums import DecisionAction, PolicyOutcome
from domain.models import Conflict, JobState
from domain.policies.rules import PolicyRule, evaluate

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
    """Deterministic verdict plus a supervisor-facing question."""
    rule = evaluate(conflict, state)
    return PolicyVerdict(
        conflict_id=conflict.id,
        outcome=rule.outcome,
        rule=rule,
        question=phrase_question(conflict, rule),
        recommended_action=rule.recommended_action or DecisionAction.REQUEST_CLARIFICATION,
        financial_impact=conflict.financial_impact,
    )


def phrase_question(conflict: Conflict, rule: PolicyRule) -> str:
    from agents.runtime import stub_mode

    if stub_mode():
        return _phrase_stub(conflict)
    raise NotImplementedError("Bedrock path not wired yet - run with FIELDPROOF_STUB_AGENTS=1")


def _phrase_stub(conflict: Conflict) -> str:
    if conflict.financial_impact:
        return (
            f"{conflict.description} Approve the additional "
            f"{conflict.financial_impact:.2f}?"
        )
    return f"{conflict.description} How should this be resolved?"
