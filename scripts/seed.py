"""Seed the local store so the dashboard has something to show.

    python scripts/seed.py            # hero job, paused at the decision
    python scripts/seed.py --all      # every fixture, run to completion
    python scripts/seed.py --reset    # wipe local state first

The hero job is deliberately left paused at the supervisor decision: that is
the state the demo opens in (PRD 42, Scene 6).
"""

from __future__ import annotations

import argparse

from agents.orchestrator import run_workflow
from demo.loader import complete_job, create_job, list_fixtures, load_fixture, submit_evidence
from demo.runner import run_scenario
from infra.settings import get_store


def seed_hero() -> str:
    """Create JOB-1842 and drive it up to - but not through - the decision."""
    fixture = load_fixture("JOB-1842")
    job_id = create_job(fixture)
    submit_evidence(job_id, fixture.evidence, announce=False)
    complete_job(job_id)
    run_workflow(job_id)                                    # pauses: missing evidence
    submit_evidence(job_id, fixture.followup_evidence)      # technician responds
    run_workflow(job_id)                                    # pauses: decision required
    return job_id


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed FieldProof demo data")
    parser.add_argument("--all", action="store_true", help="run every fixture to completion")
    parser.add_argument("--reset", action="store_true", help="wipe local state first")
    args = parser.parse_args()

    store = get_store()
    if args.reset and hasattr(store, "reset"):
        store.reset()
        print("local state cleared")

    if args.all:
        for fixture in list_fixtures():
            if fixture.job_id == "JOB-1842":
                continue
            outcome = run_scenario(fixture)
            print(f"{outcome.job_id:<10} {outcome.family:<22} {outcome.final_status}")

    job_id = seed_hero()
    state = store.get_state(job_id)
    print(f"\n{job_id} seeded and waiting: {state.job.status.value}")
    for decision in state.pending_decisions():
        print(f"  decision {decision.id}: {decision.question}")
        print(f"  open http://localhost:3000/decisions/{decision.id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
