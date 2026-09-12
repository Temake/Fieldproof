"""The Strands tool surface (PRD 18, 24, INV-010).

These tools are what a model gets when it drives closeout itself. The point of
the architecture is that handing them over is safe: authorization lives in the
domain layer, not in the prompt, so a call the model should not have made is
refused the same way whoever made it.

The tests call the tool functions directly - that is exactly what the SDK's
tool loop does with the model's arguments, minus the model.
"""

from __future__ import annotations

import pytest

pytest.importorskip("strands", reason="needs the agents extra")

from tools.strands_tools import (
    CLOSEOUT_TOOLS,
    fieldproof_close_job,
    fieldproof_job_context,
    fieldproof_request_decision,
)


def _call(tool, **kwargs):
    """Invoke a @tool with the arguments a model would supply."""
    return tool(**kwargs)


def test_every_tool_publishes_a_usable_spec():
    """A model can only call what it can understand: name, description, schema."""
    for tool in CLOSEOUT_TOOLS:
        spec = tool.tool_spec
        assert spec["name"].startswith("fieldproof_")
        assert len(spec["description"]) > 40, spec["name"]
        schema = spec["inputSchema"]["json"]
        assert "job_id" in schema["properties"], spec["name"]
        for name, prop in schema["properties"].items():
            assert prop.get("description"), f"{spec['name']}.{name} has no description"


def test_context_tool_reports_what_the_job_needs(hero_job):
    context = _call(fieldproof_job_context, job_id=hero_job.job_id)
    assert context["ok"] is True
    assert context["data"]["requirements"]


def test_closing_early_is_refused_with_the_invariant(hero_job):
    """INV-001/INV-002: a model that proposes closing an unfinished job is told no."""
    from demo.loader import complete_job, submit_evidence

    submit_evidence(hero_job.job_id, hero_job.evidence, announce=False)
    complete_job(hero_job.job_id)

    result = _call(fieldproof_close_job, job_id=hero_job.job_id)

    assert result["ok"] is False
    assert result["refused_reason"]
    assert result["invariant"] in ("INV-001", "INV-002")

    from infra.settings import get_store

    assert get_store().get_state(hero_job.job_id).job.status.value != "CLOSED"


def test_a_refusal_is_data_not_an_exception(hero_job):
    """The model has to be able to read the refusal and choose again."""
    result = _call(
        fieldproof_request_decision,
        job_id=hero_job.job_id,
        conflict_id="CON-NOPE",
        question="Approve?",
        policy="POL-003",
        recommended_action="NOT_A_REAL_ACTION",
    )
    assert result["ok"] is False
    assert "recommended_action" in result["refused_reason"]


def test_refusals_are_audited(hero_job):
    """INV-007: refusing a model is itself an event on the job."""
    from domain.enums import EventType
    from infra.settings import get_store

    _call(fieldproof_close_job, job_id=hero_job.job_id)

    events = get_store().get_state(hero_job.job_id).events
    assert any(e.type == EventType.ACTION_FAILED for e in events)
