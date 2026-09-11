"""Policy rules (PRD 16 Agent 4, PRD 27).

The Policy Agent may *interpret* these rules and explain them in natural
language. The verdict that actually gates execution is computed here.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..enums import ConflictSeverity, ConflictType, DecisionAction, PolicyOutcome
from ..models import Conflict, JobState


@dataclass(frozen=True)
class PolicyRule:
    id: str
    description: str
    outcome: PolicyOutcome
    severity: ConflictSeverity
    recommended_action: DecisionAction | None = None


#: Ordered registry. First matching rule for a conflict type wins.
RULES: dict[ConflictType, PolicyRule] = {
    ConflictType.MISSING_ARTIFACT: PolicyRule(
        id="POL-001",
        description="Missing required evidence must be requested from the technician "
        "before the job can be escalated to a supervisor.",
        outcome=PolicyOutcome.REQUEST_EVIDENCE,
        severity=ConflictSeverity.BLOCKING,
    ),
    ConflictType.LOW_CONFIDENCE_EVIDENCE: PolicyRule(
        id="POL-002",
        description="Evidence below 0.70 confidence cannot verify a critical requirement; "
        "request a clearer artifact.",
        outcome=PolicyOutcome.REQUEST_EVIDENCE,
        severity=ConflictSeverity.BLOCKING,
    ),
    ConflictType.QUANTITY_MISMATCH: PolicyRule(
        id="POL-003",
        description="Parts installed outside the original approved scope require "
        "supervisor approval.",
        outcome=PolicyOutcome.REQUIRE_HUMAN,
        severity=ConflictSeverity.BLOCKING,
        recommended_action=DecisionAction.APPROVE,
    ),
    ConflictType.SPENDING_LIMIT_VIOLATION: PolicyRule(
        id="POL-004",
        description="Additional spend above the authorized limit requires supervisor "
        "approval before invoicing.",
        outcome=PolicyOutcome.REQUIRE_HUMAN,
        severity=ConflictSeverity.BLOCKING,
        recommended_action=DecisionAction.APPROVE,
    ),
    ConflictType.PRICE_MISMATCH: PolicyRule(
        id="POL-005",
        description="Receipt totals that differ from reported cost by more than the "
        "tolerance require supervisor review.",
        outcome=PolicyOutcome.REQUIRE_HUMAN,
        severity=ConflictSeverity.WARNING,
        recommended_action=DecisionAction.APPROVE,
    ),
    ConflictType.UNSUPPORTED_COMPLETION_CLAIM: PolicyRule(
        id="POL-006",
        description="A completion claim with no compatible supporting evidence blocks "
        "closeout.",
        outcome=PolicyOutcome.REQUEST_EVIDENCE,
        severity=ConflictSeverity.BLOCKING,
    ),
    ConflictType.TASK_NOT_COMPLETED: PolicyRule(
        id="POL-007",
        description="An incomplete required task blocks closeout and needs a human.",
        outcome=PolicyOutcome.BLOCK,
        severity=ConflictSeverity.BLOCKING,
        recommended_action=DecisionAction.REJECT,
    ),
    ConflictType.DUPLICATE_SUBMISSION: PolicyRule(
        id="POL-008",
        description="An identical artifact hash already on the job is ignored, not "
        "counted twice.",
        outcome=PolicyOutcome.AUTO_RESOLVE,
        severity=ConflictSeverity.INFO,
    ),
}

#: Currency tolerance below which a price mismatch is auto-resolved.
PRICE_TOLERANCE = 1.00


def rule_for(conflict: Conflict) -> PolicyRule:
    rule = RULES.get(conflict.type)
    if rule is None:
        # Unknown conflict types fail closed - a human looks at it.
        return PolicyRule(
            id="POL-000",
            description="Unclassified conflict requires human review.",
            outcome=PolicyOutcome.REQUIRE_HUMAN,
            severity=ConflictSeverity.BLOCKING,
            recommended_action=DecisionAction.REQUEST_CLARIFICATION,
        )
    return rule


def evaluate(conflict: Conflict, state: JobState) -> PolicyRule:
    """Return the governing rule, applying the small number of contextual carve-outs."""
    rule = rule_for(conflict)

    if (
        conflict.type == ConflictType.PRICE_MISMATCH
        and abs(conflict.financial_impact) <= PRICE_TOLERANCE
    ):
        return PolicyRule(
            id=rule.id,
            description=f"{rule.description} Difference is within the "
            f"{PRICE_TOLERANCE:.2f} tolerance.",
            outcome=PolicyOutcome.AUTO_RESOLVE,
            severity=ConflictSeverity.INFO,
        )

    if conflict.type in (
        ConflictType.QUANTITY_MISMATCH,
        ConflictType.SPENDING_LIMIT_VIOLATION,
    ):
        allowance = state.job.max_additional_spend_without_approval
        if conflict.financial_impact <= allowance:
            return PolicyRule(
                id=rule.id,
                description=f"{rule.description} Impact of "
                f"{conflict.financial_impact:.2f} is within the "
                f"{allowance:.2f} pre-authorized allowance.",
                outcome=PolicyOutcome.AUTO_RESOLVE,
                severity=ConflictSeverity.INFO,
            )

    return rule
