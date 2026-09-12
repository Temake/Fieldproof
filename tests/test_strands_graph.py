"""The Strands graph runtime (PRD 15.1, 17).

FieldProof has two orchestrators and one workflow. These tests pin that: the
Strands graph must reach the same outcomes as the in-process one on the whole
evaluation dataset, take its branches from the same deterministic verdicts, and
enforce the same invariants. A Strands path that quietly behaved differently
would be worse than no Strands path at all.
"""

from __future__ import annotations

import pytest

from agents.orchestrator.graph import Branch, Node
from demo.loader import list_fixtures
from demo.runner import run_scenario

FIXTURES = list_fixtures()

pytest.importorskip("strands", reason="needs the agents extra")


@pytest.fixture
def strands(env):
    """Run this test's workflow through the Strands graph."""
    env(FIELDPROOF_ORCHESTRATOR="strands")
    from infra.settings import get_settings

    assert get_settings().orchestrator == "strands"


@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda f: f.job_id)
def test_strands_graph_matches_the_dataset(strands, fixture):
    """Every fixture expectation holds when the Strands graph drives the steps."""
    outcome = run_scenario(fixture)
    problems = outcome.matches(fixture.expected)
    assert not problems, f"{fixture.job_id} ({fixture.name}): " + "; ".join(problems)


def test_blocking_conflict_never_closes(strands):
    """INV-001 on the Strands path: no close while a blocking conflict stands."""
    fixture = next(f for f in FIXTURES if f.name == "incomplete-work")
    assert run_scenario(fixture).final_status != "CLOSED"


def test_a_pause_ends_the_graph(strands, hero_job):
    """A wait is terminal: the graph exits rather than holding a session open (FR-12)."""
    from agents.orchestrator import run_workflow
    from demo.loader import complete_job, submit_evidence

    submit_evidence(hero_job.job_id, hero_job.evidence, announce=False)
    complete_job(hero_job.job_id)
    result = run_workflow(hero_job.job_id, trigger="test")

    assert result.outcome in ("WAITING_FOR_EVIDENCE", "WAITING_FOR_DECISION")
    assert Node.ACTION.value not in result.steps
    assert Node.DONE.value not in result.steps


def test_topology_is_the_in_process_topology():
    """The graph's nodes are exactly the workflow's nodes."""
    from agents.orchestrator.graph import RunResult
    from agents.orchestrator.strands_graph import build_graph

    graph, nodes = build_graph("JOB-TEST", RunResult(job_id="JOB-TEST", outcome=""))
    assert set(nodes) == {
        Node.LOAD_CONTEXT.value,
        Node.PARSE_EVIDENCE.value,
        Node.RECONCILE.value,
        Node.POLICY_CHECK.value,
        Node.REQUEST_EVIDENCE.value,
        Node.HUMAN_DECISION.value,
        Node.ACTION.value,
    }
    assert set(graph.nodes) == set(nodes)


def test_nodes_are_strands_custom_nodes():
    """Real Strands graph nodes, not a hand-rolled sequencer wearing the name."""
    from strands.multiagent.base import MultiAgentBase

    from agents.orchestrator.graph import RunResult
    from agents.orchestrator.strands_graph import build_graph

    _graph, nodes = build_graph("JOB-TEST", RunResult(job_id="JOB-TEST", outcome=""))
    assert all(isinstance(n, MultiAgentBase) for n in nodes.values())


@pytest.mark.parametrize(
    ("branch", "expected"),
    [
        (Branch(), "clean"),
        (Branch(recoverable=["v"]), "evidence"),
        (Branch(escalations=["v"]), "human"),
        (Branch(awaiting=["c"]), "evidence"),
        # Missing evidence outranks an escalation, which outranks a relay -
        # the same precedence the in-process orchestrator applies.
        (Branch(recoverable=["v"], escalations=["v"]), "evidence"),
        (Branch(escalations=["v"], awaiting=["c"]), "human"),
    ],
)
def test_exactly_one_edge_is_taken(branch, expected):
    from agents.orchestrator import strands_graph as sg

    taken = {
        "evidence": sg.needs_evidence(branch),
        "human": sg.needs_human(branch),
        "clean": sg.is_clean(branch),
    }
    assert [k for k, v in taken.items() if v] == [expected]
