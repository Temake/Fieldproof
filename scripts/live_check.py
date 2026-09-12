"""Read a real artifact with the live Evidence Agent (PRD 16 Agent 2, FR-03).

Offline, FieldProof reads each fixture's declared `fixture_reading`, which is
what makes the tests and the headless demo deterministic. That determinism is
also why the demo fixtures are text stand-ins rather than photographs - so this
script exists to exercise the other path: your own photo or receipt, read
through Bedrock by the Strands agent, printed as the observations the
reconciliation engine would receive.

    pip install -e ".[dev]"
    export FIELDPROOF_STUB_AGENTS=0        # and AWS credentials with Bedrock access
    python scripts/live_check.py ~/Desktop/receipt.jpg --type receipt

Nothing here is a mock: the bytes are stored, hashed, re-read, hash-checked and
handed to the model exactly as an upload through the API would be.
"""

from __future__ import annotations

import argparse
import mimetypes
import sys
from pathlib import Path

from domain.enums import EvidenceType, JobStatus
from domain.models import Job, Requirement

#: Extension -> artifact type, for when --type is not given.
GUESS: dict[str, EvidenceType] = {
    ".jpg": EvidenceType.IMAGE,
    ".jpeg": EvidenceType.IMAGE,
    ".png": EvidenceType.IMAGE,
    ".webp": EvidenceType.IMAGE,
    ".gif": EvidenceType.IMAGE,
    ".pdf": EvidenceType.PDF,
    ".m4a": EvidenceType.VOICE_NOTE,
    ".mp3": EvidenceType.VOICE_NOTE,
    ".wav": EvidenceType.VOICE_NOTE,
    ".txt": EvidenceType.CHECKLIST,
}

JOB_ID = "JOB-LIVECHECK"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path, help="A real photo, receipt, PDF or voice note.")
    parser.add_argument(
        "--type",
        dest="evidence_type",
        choices=[e.value for e in EvidenceType],
        help="Artifact type. Guessed from the extension when omitted.",
    )
    parser.add_argument(
        "--parts",
        default="",
        help="Comma-separated part numbers to look for, e.g. FLT-A-220.",
    )
    args = parser.parse_args()

    if not args.artifact.is_file():
        print(f"no such file: {args.artifact}", file=sys.stderr)
        return 2

    from infra.settings import get_settings, get_store

    settings = get_settings()
    if settings.stub_agents:
        print(
            "FIELDPROOF_STUB_AGENTS is on, so this would replay a fixture reading "
            "instead of calling a model.\nSet FIELDPROOF_STUB_AGENTS=0 and provide "
            "AWS credentials with Bedrock access.",
            file=sys.stderr,
        )
        return 2

    kind = (
        EvidenceType(args.evidence_type)
        if args.evidence_type
        else GUESS.get(args.artifact.suffix.lower(), EvidenceType.IMAGE)
    )
    data = args.artifact.read_bytes()
    print(f"artifact  {args.artifact.name}  ({len(data):,} bytes, read as {kind.value})")
    print(f"model     {settings.bedrock_model_id}  in {settings.bedrock_region}\n")

    store = get_store()
    _scratch_job(store, args.parts)

    from tools.evidence import upload_evidence

    evidence = upload_evidence(
        JOB_ID,
        filename=args.artifact.name,
        data=data,
        evidence_type=kind,
        uploaded_by="live_check",
        content_type=mimetypes.guess_type(args.artifact.name)[0],
    )
    print(f"stored    {evidence.id}  sha256={evidence.sha256[:16]}...")

    from agents.evidence import analyze

    reading = analyze(evidence, store.get_state(JOB_ID))

    if reading.metadata.get("extraction_failed"):
        print(f"\nUNREADABLE: {reading.metadata.get('extraction_error')}")
        print("The workflow would ask the technician for a clearer copy (PRD 36).")
        return 1

    print(f"\n--- observations ({len(reading.observations)}) " + "-" * 30)
    for observation in reading.observations:
        detail = observation.detail or ""
        extra = " ".join(
            f"{k}={v}"
            for k, v in (
                ("component", observation.component),
                ("qty", observation.quantity),
                ("value", observation.value),
            )
            if v
        )
        print(f"  {observation.type:22} conf={observation.confidence:.2f}  {extra} {detail}")
    if reading.transcript:
        print(f"\ntranscript: {reading.transcript}")
    return 0


def _scratch_job(store, parts: str) -> None:
    """A throwaway work order to hang the artifact on."""
    try:
        store.get_state(JOB_ID)
        return
    except Exception as exc:  # noqa: BLE001 - not found is the normal case
        print(f"creating scratch job {JOB_ID} ({type(exc).__name__})")
    job = Job(
        id=JOB_ID,
        customer_id="CUS-LIVE",
        technician_id="TECH-LIVE",
        technician_name="Live Check",
        description="Live evidence read",
        site_address="-",
        authorized_amount=0.0,
        status=JobStatus.IN_PROGRESS,
    )
    requirements = [
        Requirement(
            job_id=JOB_ID,
            type="installation_quantity",
            description=f"Install {part}",
            part_number=part,
            required=True,
        )
        for part in (p.strip() for p in parts.split(",") if p.strip())
    ]
    store.create_job(job, requirements)


if __name__ == "__main__":
    raise SystemExit(main())
