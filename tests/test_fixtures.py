"""Evaluation dataset (PRD 37).

Every fixture family is asserted against its declared expectations, so a change
to the reconciliation or policy layer that quietly alters behaviour on one
scenario family fails here rather than in the demo.
"""

from __future__ import annotations

import pytest

from demo.loader import list_fixtures
from demo.runner import run_scenario

FIXTURES = list_fixtures()


def test_dataset_covers_every_family():
    """PRD 37 asks for 15-25 jobs across every scenario family."""
    families = {f.name for f in FIXTURES}
    assert 15 <= len(FIXTURES) <= 25, f"{len(FIXTURES)} fixtures"
    assert {
        "happy",
        "missing-evidence",
        "contradiction",
        "unauthorized-work",
        "bad-evidence",
        "duplicate-submission",
        "human-rejection",
        "resumption",
    } <= families


@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda f: f.job_id)
def test_scenario_matches_expectations(fixture):
    outcome = run_scenario(fixture)
    problems = outcome.matches(fixture.expected)
    assert not problems, f"{fixture.job_id} ({fixture.name}): " + "; ".join(problems)


def test_incomplete_work_never_closes():
    """INV-001 end to end: the job with no evidence for the second unit must not close."""
    fixture = next(f for f in FIXTURES if f.name == "incomplete-work")
    outcome = run_scenario(fixture)
    assert outcome.final_status != "CLOSED"
