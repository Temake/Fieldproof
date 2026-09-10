"""Agent 2 - Evidence Agent (PRD 16, FR-03, FR-04, FR-05).

Turns unstructured artifacts into structured observations. This is the only
agent that touches a multimodal model.

Tools: read_image, transcribe_audio, extract_receipt, read_document,
calculate_hash.

The agent output is deliberately narrow - observations with a confidence value
and nothing else. Claim construction happens in deterministic code
(domain/claims/normalize.py), so a hallucinated claim type cannot reach the
reconciliation engine.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from domain.models import Evidence, Observation
from agents.runtime import stub_mode

SYSTEM_PROMPT = """You are the Evidence Agent for FieldProof.

You examine one artifact from a completed field-service job and report only
what you can actually see or hear in it.

Rules:
- Report observations, never conclusions about whether the job is complete.
- Every observation carries a confidence between 0 and 1. Be honest: a blurry
  or partial image is low confidence, and low confidence is useful information.
- Count only what is distinctly visible. Two photos of the same unit are one
  unit, not two.
- A receipt tells you what was PURCHASED. It never tells you what was
  INSTALLED. Never report an installation from a receipt.
- If you cannot tell, say so with a low confidence rather than guessing.

Valid observation types:
  installed_component, purchased_line_item, signature_present, site_photo,
  amount_paid, spoken_statement, task_completed
"""


class ObservationOut(BaseModel):
    """Structured output schema the model must fill (PRD FR-03)."""

    type: str = Field(description="One of the valid observation types")
    confidence: float = Field(ge=0.0, le=1.0, description="How certain you are")
    component: str | None = Field(default=None, description="Part number or component name")
    quantity: int | None = Field(default=None, description="Distinctly visible count")
    detail: str | None = Field(default=None, description="What in the artifact supports this")


class EvidenceReading(BaseModel):
    observations: list[ObservationOut] = Field(default_factory=list)
    transcript: str | None = Field(default=None, description="Text or speech content, if any")


def analyze(evidence: Evidence, blob: bytes | None = None) -> tuple[list[Observation], str | None]:
    """Extract observations from one artifact.

    In stub mode this defers to the deterministic extractors so the workflow,
    the tests and the demo all run without Bedrock.
    """
    if stub_mode():
        from .extractors import extract_stub

        return extract_stub(evidence)
    return _analyze_with_model(evidence, blob)


def _analyze_with_model(evidence: Evidence, blob: bytes | None):
    """TODO: build the multimodal prompt and call the Evidence Agent.

    Shape:
        agent = build_agent("evidence", SYSTEM_PROMPT, tools=EVIDENCE_TOOLS)
        result = agent(
            [{"text": ...}, {"image": {"format": "png", "source": {"bytes": blob}}}],
            structured_output_model=EvidenceReading,
        )
        reading = result.structured_output
    """
    raise NotImplementedError("Bedrock path not wired yet - run with FIELDPROOF_STUB_AGENTS=1")
