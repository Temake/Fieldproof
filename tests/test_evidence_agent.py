"""Evidence Agent model path (PRD FR-03..FR-05, PRD 36).

Bedrock is replaced by a fake agent with the same calling convention Strands
uses - agent(content_blocks, structured_output_model=Schema) returning an
object with .structured_output - so these tests exercise the real prompt
building, dispatch, validation, retry and fallback code offline.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

import agents.evidence.agent as evidence_agent
import agents.evidence.tools as evidence_tools
from agents import runtime
from agents.orchestrator import run_workflow
from demo.loader import complete_job, create_job, load_fixture
from domain.enums import DecisionAction, EvidenceType, JobStatus, RequirementStatus
from tools.decisions import resolve_decision

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)


class FakeAgent:
    """Stands in for strands.Agent. `respond(content, schema)` builds the output."""

    def __init__(self, respond):
        self.respond = respond
        self.calls: list[tuple[list, type]] = []

    def __call__(self, content, structured_output_model=None):
        self.calls.append((content, structured_output_model))
        return SimpleNamespace(structured_output=self.respond(content, structured_output_model))


@pytest.fixture
def model(monkeypatch):
    """Switch off stub mode and route every agent build to one FakeAgent."""
    holder = {}

    def install(respond):
        fake = FakeAgent(respond)
        holder["agent"] = fake
        build = lambda *args, **kwargs: fake
        monkeypatch.setattr(runtime, "stub_mode", lambda: False)
        monkeypatch.setattr(evidence_agent, "stub_mode", lambda: False)
        monkeypatch.setattr(runtime, "build_agent", build)
        monkeypatch.setattr(evidence_tools, "build_agent", build)
        monkeypatch.setattr(evidence_tools.time, "sleep", lambda s: None)
        return fake

    return install


def _blob(content) -> bytes | None:
    for block in content if isinstance(content, list) else []:
        for kind in ("image", "document"):
            if kind in block:
                return block[kind]["source"]["bytes"]
    return None


def _prompt(content) -> str:
    if isinstance(content, str):
        return content
    return " ".join(b["text"] for b in content if "text" in b)


def _job(store):
    fixture = load_fixture("JOB-1842")
    return fixture, create_job(fixture)


def _upload(job_id, filename, data, kind, **metadata):
    from tools.evidence import upload_evidence

    return upload_evidence(
        job_id,
        filename=filename,
        data=data,
        evidence_type=kind,
        uploaded_by="TECH-004",
        metadata=metadata,
    )


def test_image_reading_is_validated_and_scoped_to_the_job(store, model):
    fake = model(
        lambda content, schema: schema(
            observations=[
                {"type": "installed_component", "confidence": 0.93,
                 "component": "HVAC-FILTER-A", "quantity": 2},
                {"type": "looks_great", "confidence": 0.99},  # not in the vocabulary
            ]
        )
    )
    _, job_id = _job(store)
    evidence = _upload(job_id, "after.png", PNG, EvidenceType.IMAGE, stage="after")

    reading = evidence_agent.analyze(evidence, store.get_state(job_id))

    assert [o.type for o in reading.observations] == ["installed_component"]
    content, _ = fake.calls[0]
    assert content[1]["image"]["format"] == "png"
    assert "HVAC-FILTER-A" in _prompt(content)
    assert "AFTER photo" in _prompt(content)


def test_receipt_extraction_keeps_prices_for_the_financial_check(store, model):
    model(
        lambda content, schema: schema(
            vendor="SupplyCo",
            line_items=[{"description": "Air Filter A", "part_number": "HVAC-FILTER-A",
                         "quantity": 3, "unit_price": 54.0, "total_price": 162.0}],
            total=162.0,
            confidence=0.96,
        )
    )
    _, job_id = _job(store)
    evidence = _upload(job_id, "receipt.pdf", b"%PDF-1.4 receipt", EvidenceType.RECEIPT)

    reading = evidence_agent.analyze(evidence, store.get_state(job_id))

    types = sorted(o.type for o in reading.observations)
    assert types == ["amount_paid", "purchased_line_item"]
    assert reading.metadata["line_items"][0]["unit_price"] == 54.0


def test_model_failure_retries_then_falls_back_to_asking_a_human(store, model, notifier):
    def broken(content, schema):
        raise RuntimeError("ThrottlingException")

    fake = model(broken)
    _, job_id = _job(store)
    _upload(job_id, "receipt.pdf", b"%PDF-1.4 smudged", EvidenceType.RECEIPT)
    complete_job(job_id)

    run_workflow(job_id)

    # extract_receipt twice, then the alternate reader twice (PRD 36).
    assert len(fake.calls) >= 4
    state = store.get_state(job_id)
    receipt_req = next(r for r in state.requirements if r.type.value == "parts_receipt")
    assert receipt_req.status != RequirementStatus.VERIFIED
    assert state.job.status == JobStatus.WAITING_FOR_EVIDENCE
    assert any("Could not read receipt.pdf" in (e.message or "") for e in state.events)
    assert "clearer" in notifier.sent[-1].message


def test_tampered_bytes_are_never_read(store, model):
    fake = model(lambda _content, schema: schema(observations=[]))
    _, job_id = _job(store)
    evidence = _upload(job_id, "after.png", PNG, EvidenceType.IMAGE, stage="after")

    from infra.settings import get_object_store

    get_object_store().put(evidence.metadata["object_key"], PNG + b"edited")
    reading = evidence_agent.analyze(evidence, store.get_state(job_id))

    assert reading.metadata["extraction_failed"]
    assert reading.observations[0].confidence == 0.0
    assert fake.calls == []


def test_text_voice_note_is_transcribed_and_read(store, model):
    fake = model(
        lambda content, schema: schema(
            observations=[{"type": "spoken_statement", "confidence": 0.9,
                           "component": "HVAC-FILTER-A", "quantity": 3}]
        )
    )
    _, job_id = _job(store)
    evidence = _upload(job_id, "note.txt", b"Replaced all three filters.", EvidenceType.VOICE_NOTE)

    reading = evidence_agent.analyze(evidence, store.get_state(job_id))

    assert reading.transcript == "Replaced all three filters."
    assert "Replaced all three filters." in _prompt(fake.calls[0][0])
    assert reading.observations[0].quantity == 3


def test_policy_wording_may_not_drop_the_amount(store, model):
    from agents.policy import phrase_question
    from domain.enums import ConflictSeverity, ConflictType
    from domain.models import Conflict
    from domain.policies.rules import RULES

    conflict = Conflict(
        job_id="JOB-1", type=ConflictType.QUANTITY_MISMATCH, severity=ConflictSeverity.BLOCKING,
        description="3 units verified but only 2 authorized.", financial_impact=54.0,
    )
    rule = RULES[ConflictType.QUANTITY_MISMATCH]

    model(lambda c, schema: schema(question="Approve the extra filter?"))
    assert "54.00" in phrase_question(conflict, rule)  # template wins

    model(lambda c, schema: schema(question="Approve one extra Filter A for $54?"))
    assert phrase_question(conflict, rule) == "Approve one extra Filter A for $54?"


def test_hero_scenario_end_to_end_in_model_mode(store, model):
    """The PRD 12 demo with every artifact read through the model path."""
    fixture = load_fixture("JOB-1842")
    items = fixture.evidence + fixture.followup_evidence
    readings = {item["text"].encode(): item for item in items}

    def respond(content, schema):
        blob = _blob(content)
        item = readings.get(blob) if blob else next(
            (i for i in items if i["type"] == "voice_note"), None
        )
        declared = item["metadata"]["fixture_reading"]
        if schema.__name__ == "ReceiptOut":
            return schema(line_items=item["metadata"]["line_items"], total=162.0, confidence=0.97)
        return schema(observations=declared["observations"], text=declared.get("transcript"))

    model(respond)
    job_id = create_job(fixture)

    def upload(batch):
        for item in batch:
            name = item["filename"]
            if item["type"] == "voice_note":
                name = name.rsplit(".", 1)[0] + ".txt"  # transcript already text
            metadata = {k: v for k, v in item["metadata"].items()
                        if k not in ("fixture_reading", "line_items")}
            _upload(job_id, name, item["text"].encode(), EvidenceType(item["type"]), **metadata)

    upload(fixture.evidence)
    complete_job(job_id)
    assert run_workflow(job_id).outcome == "WAITING_FOR_EVIDENCE"

    upload(fixture.followup_evidence)
    assert run_workflow(job_id).outcome == "WAITING_FOR_DECISION"

    decision = store.get_state(job_id).pending_decisions()[0]
    assert decision.financial_impact == 54.0  # unit price came from the model's receipt read

    resolve_decision(decision.id, DecisionAction.APPROVE, decided_by="Sarah")
    assert run_workflow(job_id).outcome == "CLOSED"
    assert store.get_state(job_id).job.final_amount == 354.0
