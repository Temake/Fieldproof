"""Evidence Agent tools (PRD 16): read_image, transcribe_audio, extract_receipt,
read_document, calculate_hash.

Each tool understands one kind of artifact and returns observations - never
claims. The model sees exactly one artifact per call, with a prompt narrowed to
what that artifact can actually show (PRD 25).
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import PurePath
from typing import Any

from pydantic import BaseModel, Field

from agents.runtime import build_agent
from domain.models import Evidence, Observation, ReceiptExtraction

log = logging.getLogger("fieldproof.evidence")

#: Bedrock Converse limits for inline media.
MAX_IMAGE_BYTES = 3_750_000
MAX_DOCUMENT_BYTES = 4_500_000

IMAGE_FORMATS = {"png": "png", "jpg": "jpeg", "jpeg": "jpeg", "gif": "gif", "webp": "webp"}
DOCUMENT_FORMATS = {
    "pdf", "csv", "doc", "docx", "xls", "xlsx", "html", "txt", "md",
}


@dataclass
class Reading:
    """What one tool extracted from one artifact."""

    observations: list[Observation] = field(default_factory=list)
    transcript: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class ObservationOut(BaseModel):
    """Structured output the model must fill (PRD FR-03)."""

    type: str = Field(description="One of the observation types listed in the instructions")
    confidence: float = Field(ge=0.0, le=1.0, description="How certain you are, 0 to 1")
    component: str | None = Field(default=None, description="Part number or component name")
    quantity: int | None = Field(default=None, description="Count of distinctly visible units")
    detail: str | None = Field(default=None, description="What in the artifact shows this")


class ArtifactReading(BaseModel):
    observations: list[ObservationOut] = Field(default_factory=list)
    text: str | None = Field(default=None, description="Any legible text or speech content")


# -- calculate_hash ------------------------------------------------------------


def calculate_hash(blob: bytes) -> str:
    """PRD FR-02 - content hash, recomputed to prove the stored bytes are the uploaded ones."""
    return hashlib.sha256(blob).hexdigest()


# -- read_image ----------------------------------------------------------------

IMAGE_PROMPT = """You are looking at one photo from a completed {job} job.
{stage_hint}
Parts this job is about: {parts}.

Report only what is distinctly visible:
- installed_component: a part visibly installed. Set component to the matching
  part number from the list above when you can tell, and quantity to how many
  distinct installed units you can see. Two angles of the same unit are ONE unit.
- site_photo: the photo shows the job site or equipment (use for before photos).
- task_completed: the photo shows a finished task.

A blurry, dark or partial photo is LOW confidence. Say so honestly - a low
confidence reading makes FieldProof ask for a better photo instead of guessing.
"""

SIGNATURE_PROMPT = """This image should contain a customer's signature on a
service form. Report signature_present if a handwritten signature is visible,
with confidence reflecting how clearly it is a real signature (not blank, not a
printed name). If there is no signature, return no observations."""


def read_image(evidence: Evidence, blob: bytes, context: dict[str, Any]) -> Reading:
    fmt = _image_format(evidence)
    if len(blob) > MAX_IMAGE_BYTES:
        raise ValueError(f"image is {len(blob)} bytes; limit is {MAX_IMAGE_BYTES}")

    if evidence.type.value == "signature":
        prompt = SIGNATURE_PROMPT
    else:
        stage = evidence.metadata.get("stage")
        prompt = IMAGE_PROMPT.format(
            job=context.get("description") or "field-service",
            stage_hint={
                "before": "This is a BEFORE photo, taken before any work.",
                "after": "This is an AFTER photo, taken once the work was done.",
            }.get(stage, ""),
            parts=", ".join(context.get("parts") or []) or "not specified",
        )

    reading = _ask(
        "evidence-image",
        [{"text": prompt}, {"image": {"format": fmt, "source": {"bytes": blob}}}],
        ArtifactReading,
    )
    return Reading(observations=_observations(reading.observations), transcript=reading.text)


# -- extract_receipt -------------------------------------------------------------


class LineItemOut(BaseModel):
    description: str
    part_number: str | None = Field(
        default=None, description="Matching part number from the job's parts list, if any"
    )
    quantity: int = Field(ge=0)
    unit_price: float | None = None
    total_price: float | None = None


class ReceiptOut(BaseModel):
    vendor: str | None = None
    line_items: list[LineItemOut] = Field(default_factory=list)
    total: float | None = None
    date: str | None = Field(default=None, description="ISO date if legible")
    confidence: float = Field(ge=0.0, le=1.0, description="How legible the receipt is overall")


RECEIPT_PROMPT = """Extract this purchase receipt (PRD FR-05): vendor, every line
item with quantity and prices, the total, and the date.
Parts this job is about: {parts}. When a line item is one of these parts, set its
part_number to that exact value. Copy numbers exactly; if a value is illegible,
leave it empty and lower your confidence. A receipt shows what was PURCHASED -
do not infer anything about installation."""


def extract_receipt(evidence: Evidence, blob: bytes, context: dict[str, Any]) -> Reading:
    from .extractors import observations_from_receipt

    parts = ", ".join(context.get("parts") or []) or "not specified"
    reading = _ask(
        "evidence-receipt",
        [{"text": RECEIPT_PROMPT.format(parts=parts)}, _media_block(evidence, blob)],
        ReceiptOut,
    )
    extraction = ReceiptExtraction(
        vendor=reading.vendor,
        line_items=[item.model_dump() for item in reading.line_items],
        total=reading.total,
        confidence=reading.confidence,
    )
    return Reading(
        observations=observations_from_receipt(extraction),
        # Unit prices feed the financial-impact calculation (INV-004).
        metadata={
            "line_items": [item.model_dump() for item in reading.line_items],
            "vendor": reading.vendor,
            "receipt_date": reading.date,
            "receipt_total": reading.total,
        },
    )


# -- read_document ---------------------------------------------------------------

DOCUMENT_PROMPT = """This is a document from a completed field-service job
(checklist, compliance form, or service report). Report:
- task_completed for each task the document marks as done (component = task name),
- signature_present if it carries a customer signature.
Put the document's legible text in `text`."""


def read_document(evidence: Evidence, blob: bytes, context: dict[str, Any]) -> Reading:
    reading = _ask(
        "evidence-document",
        [{"text": DOCUMENT_PROMPT}, _media_block(evidence, blob)],
        ArtifactReading,
    )
    return Reading(observations=_observations(reading.observations), transcript=reading.text)


# -- transcribe_audio ------------------------------------------------------------

STATEMENT_PROMPT = """A field technician left this voice note after a job.
Parts this job is about: {parts}.

Report spoken_statement for each concrete claim about work performed, with
component set to the matching part number and quantity to the number stated.
This is what the technician SAYS - report it faithfully, but it is testimony,
not proof.

Transcript:
{transcript}"""


def transcribe_audio(evidence: Evidence, blob: bytes, context: dict[str, Any]) -> Reading:
    """PRD FR-04 - speech to text, then statements to observations."""
    transcript = _transcript(evidence, blob)
    parts = ", ".join(context.get("parts") or []) or "not specified"
    reading = _ask(
        "evidence-statement",
        [{"text": STATEMENT_PROMPT.format(parts=parts, transcript=transcript)}],
        ArtifactReading,
    )
    return Reading(observations=_observations(reading.observations), transcript=transcript)


def _transcript(evidence: Evidence, blob: bytes) -> str:
    content_type = evidence.content_type or ""
    if content_type.startswith("text/") or PurePath(evidence.filename or "").suffix == ".txt":
        return blob.decode("utf-8", errors="replace").strip()
    if evidence.metadata.get("transcript"):
        return str(evidence.metadata["transcript"])

    from infra.settings import get_settings

    if get_settings().is_local:
        raise ValueError("audio transcription needs Amazon Transcribe (FIELDPROOF_MODE=aws)")
    return _amazon_transcribe(evidence)


def _amazon_transcribe(evidence: Evidence, timeout_seconds: float = 120) -> str:
    import urllib.request

    import boto3

    from infra.settings import get_settings

    settings = get_settings()
    client = boto3.client("transcribe", region_name=settings.aws_region)
    job_name = f"fieldproof-{evidence.id}"
    media_format = PurePath(evidence.filename or "note.m4a").suffix.lstrip(".") or "m4a"
    try:
        client.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={"MediaFileUri": evidence.storage_url},
            MediaFormat=media_format,
            LanguageCode="en-US",
        )
    except client.exceptions.ConflictException:
        pass  # already started by an earlier attempt - just wait for it

    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        job = client.get_transcription_job(TranscriptionJobName=job_name)["TranscriptionJob"]
        status = job["TranscriptionJobStatus"]
        if status == "COMPLETED":
            uri = job["Transcript"]["TranscriptFileUri"]
            with urllib.request.urlopen(uri, timeout=30) as response:
                body = json.loads(response.read())
            return body["results"]["transcripts"][0]["transcript"]
        if status == "FAILED":
            raise RuntimeError(job.get("FailureReason", "transcription failed"))
        time.sleep(2)
    raise TimeoutError(f"transcription of {evidence.id} did not finish in {timeout_seconds}s")


# -- model plumbing ----------------------------------------------------------------

EVIDENCE_SYSTEM_PROMPT = """You are the Evidence Agent for FieldProof.

You examine one artifact from a completed field-service job and report only
what you can actually see, read or hear in it.

Rules:
- Report observations, never conclusions about whether the job is complete.
- Every observation carries a confidence between 0 and 1. Be honest: a blurry
  or partial artifact is low confidence, and low confidence is useful.
- Count only what is distinctly present. Two photos of one unit are one unit.
- A receipt shows what was PURCHASED. It never shows what was INSTALLED.
- If you cannot tell, say so with a low confidence rather than guessing.

Valid observation types:
  installed_component, purchased_line_item, signature_present, site_photo,
  amount_paid, spoken_statement, task_completed
"""

VALID_OBSERVATIONS = frozenset(
    {
        "installed_component",
        "purchased_line_item",
        "signature_present",
        "site_photo",
        "amount_paid",
        "spoken_statement",
        "task_completed",
    }
)

MODEL_ATTEMPTS = 2


class ExtractionFailed(RuntimeError):
    pass


def _ask(name: str, content: list[dict[str, Any]], schema: type[BaseModel]) -> Any:
    """One structured model call, retried (PRD 36: retry -> alternate -> human)."""
    last: Exception | None = None
    for attempt in range(1, MODEL_ATTEMPTS + 1):
        try:
            agent = build_agent(name, EVIDENCE_SYSTEM_PROMPT)
            result = agent(content, structured_output_model=schema)
            output = getattr(result, "structured_output", None)
            if output is None:
                raise ValueError("model returned no structured output")
            return output
        except Exception as exc:  # noqa: BLE001 - every failure mode gets a retry
            last = exc
            log.warning("%s attempt %d/%d failed: %s", name, attempt, MODEL_ATTEMPTS, exc)
            if attempt < MODEL_ATTEMPTS:
                time.sleep(0.5 * attempt)
    raise ExtractionFailed(f"{name} failed after {MODEL_ATTEMPTS} attempts: {last}")


def _observations(items: list[ObservationOut]) -> list[Observation]:
    """Drop anything outside the closed vocabulary - the model does not get to invent types."""
    out = []
    for item in items:
        if item.type not in VALID_OBSERVATIONS:
            log.info("discarding unknown observation type %r", item.type)
            continue
        out.append(
            Observation(
                type=item.type,
                confidence=item.confidence,
                component=item.component,
                quantity=item.quantity,
                detail=item.detail,
            )
        )
    return out


def _extension(evidence: Evidence) -> str:
    suffix = PurePath(evidence.filename or "").suffix.lower().lstrip(".")
    if suffix:
        return suffix
    content_type = (evidence.content_type or "").split(";")[0]
    return content_type.split("/")[-1] if "/" in content_type else ""


def _image_format(evidence: Evidence) -> str:
    ext = _extension(evidence)
    if ext not in IMAGE_FORMATS:
        raise ValueError(f"unsupported image format {ext!r}")
    return IMAGE_FORMATS[ext]


def _media_block(evidence: Evidence, blob: bytes) -> dict[str, Any]:
    """Receipts and forms arrive as photos or as documents; send whichever it is."""
    ext = _extension(evidence)
    if ext in IMAGE_FORMATS:
        if len(blob) > MAX_IMAGE_BYTES:
            raise ValueError(f"image is {len(blob)} bytes; limit is {MAX_IMAGE_BYTES}")
        return {"image": {"format": IMAGE_FORMATS[ext], "source": {"bytes": blob}}}
    if ext in DOCUMENT_FORMATS:
        if len(blob) > MAX_DOCUMENT_BYTES:
            raise ValueError(f"document is {len(blob)} bytes; limit is {MAX_DOCUMENT_BYTES}")
        # Bedrock document names allow only a narrow character set.
        name = "".join(ch if ch.isalnum() else "-" for ch in evidence.id)
        return {"document": {"format": ext, "name": name, "source": {"bytes": blob}}}
    raise ValueError(f"unsupported artifact format {ext!r}")
