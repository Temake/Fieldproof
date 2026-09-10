"""Headless demo runner (PRD 42).

Walks the nine scenes end to end and prints the timeline, so the whole workflow
is verifiable from a terminal before any UI exists.

    python -m demo.run_demo            # hero scenario, auto-approves
    python -m demo.run_demo --reject   # supervisor denies the extra charge
"""

from __future__ import annotations

import argparse
import logging

from domain.enums import DecisionAction
from infra.settings import get_notifier, get_store
from tools.decisions import resolve_decision
from tools.reports import generate_evidence_receipt

from .loader import complete_job, create_job, load_fixture, submit_evidence

SCENE = "\n\033[1m-- {} --\033[0m"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the FieldProof demo")
    parser.add_argument("--fixture", default="JOB-1842")
    parser.add_argument("--reject", action="store_true", help="supervisor rejects the extra charge")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)-7s %(name)s: %(message)s",
    )

    from agents.orchestrator import run_workflow

    fixture = load_fixture(args.fixture)
    store = get_store()

    print(SCENE.format("Scene 1: the work order"))
    job_id = create_job(fixture)
    state = store.get_state(job_id)
    print(f"{job_id}: {state.job.description}")
    for r in state.requirements:
        need = f" (x{r.expected_quantity})" if r.expected_quantity else ""
        print(f"  - {r.description}{need}")
    print(
        f"  authorized {state.job.authorized_amount:.2f}, additional spend allowance "
        f"{state.job.max_additional_spend_without_approval:.2f}"
    )

    print(SCENE.format("Scene 2: technician submits evidence and leaves"))
    submit_evidence(job_id, fixture.evidence, announce=False)
    complete_job(job_id)
    print(f"{len(fixture.evidence)} artifacts submitted by {state.job.technician_name}")

    print(SCENE.format("Scene 3-4: FieldProof works, then asks for what is missing"))
    first = run_workflow(job_id)
    print(f"outcome: {first.outcome}")
    for message in get_notifier().sent:
        print(f'  -> {message.recipient}: "{message.message}"')

    print(SCENE.format("Scene 5: technician responds, workflow resumes"))
    submit_evidence(job_id, fixture.followup_evidence)
    second = run_workflow(job_id)
    print(f"outcome: {second.outcome}")

    print(SCENE.format("Scene 6: one genuine decision reaches a human"))
    state = store.get_state(job_id)
    pending = state.pending_decisions()
    if not pending:
        print("no decision required")
    for decision in pending:
        print(f"  {decision.id}: {decision.question}")
        print(f"  policy: {decision.policy}")
        print(f"  impact: {decision.financial_impact:.2f}")
        print(f"  recommended: {decision.recommended_action.value}")

    print(SCENE.format("Scene 7-8: supervisor answers, FieldProof finishes"))
    action = DecisionAction.REJECT if args.reject else DecisionAction.APPROVE
    for decision in pending:
        resolve_decision(decision.id, action, decided_by="Sarah")
    third = run_workflow(job_id)
    print(f"outcome: {third.outcome}")

    print(SCENE.format("Timeline"))
    for event in sorted(store.get_state(job_id).events, key=lambda e: e.created_at):
        if event.message:
            print(f"  {event.created_at:%H:%M:%S}  {event.message}")

    print(SCENE.format("Scene 9: the numbers"))
    _print_metrics(job_id)

    receipt = generate_evidence_receipt(job_id)
    print(
        f"\nreceipt {receipt['receipt_id']}: {receipt['result']}, "
        f"{receipt['requirements']['verified']}/{receipt['requirements']['total']} verified, "
        f"final amount {receipt['final_amount']}"
    )
    print(f"receipt sha256: {receipt['sha256'][:32]}...")
    return 0


def _print_metrics(job_id: str) -> None:
    from domain.enums import EventType

    events = get_store().get_state(job_id).events
    steps = sum(1 for e in events if e.type == EventType.AGENT_STEP_STARTED)
    technician = sum(1 for e in events if e.type == EventType.EVIDENCE_REQUESTED)
    supervisor = sum(1 for e in events if e.type == EventType.DECISION_RESOLVED)
    total = steps + technician + supervisor
    print(f"  workflow steps           {total:>3}")
    print(f"  handled autonomously     {total - technician - supervisor:>3}")
    print(f"  technician interactions  {technician:>3}")
    print(f"  supervisor decisions     {supervisor:>3}")
    print(f"  manual document reviews  {0:>3}")


if __name__ == "__main__":
    raise SystemExit(main())
