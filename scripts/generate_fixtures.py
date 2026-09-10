"""Generate the evaluation dataset (PRD 37).

Roughly 15-25 fixture jobs covering every scenario family the PRD names. They
are generated rather than hand-written so the families stay consistent and a
new one is a few lines instead of a few hundred.

    python scripts/generate_fixtures.py

JOB-1842 is the hero scenario and is maintained by hand - this script leaves it
alone.
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "demo" / "fixtures"
HAND_WRITTEN = {"JOB-1842"}

PART = "HVAC-FILTER-A"
UNIT_PRICE = 54.0


def photo(stage: str, *, quantity: int | None = None, confidence: float = 0.95, detail: str = ""):
    obs_type = "site_photo" if stage == "before" else "installed_component"
    observation = {"type": obs_type, "confidence": confidence, "detail": detail or f"{stage} photo"}
    if quantity is not None:
        observation |= {"component": PART, "quantity": quantity}
    return {
        "type": "image",
        "filename": f"{stage}-photo.jpg",
        "text": f"{stage} photo",
        "uploaded_by": "TECH-004",
        "metadata": {"stage": stage, "fixture_reading": {"observations": [observation]}},
    }


def receipt(quantity: int, *, filename: str = "receipt.pdf", confidence: float = 0.97):
    total = round(quantity * UNIT_PRICE, 2)
    return {
        "type": "receipt",
        "filename": filename,
        "text": f"SUPPLYCO {quantity} x {PART} @ {UNIT_PRICE} = {total}",
        "uploaded_by": "TECH-004",
        "metadata": {
            "line_items": [
                {
                    "description": "Air Filter A",
                    "part_number": PART,
                    "quantity": quantity,
                    "unit_price": UNIT_PRICE,
                    "total_price": total,
                }
            ],
            "fixture_reading": {
                "observations": [
                    {
                        "type": "purchased_line_item",
                        "confidence": confidence,
                        "component": PART,
                        "quantity": quantity,
                        "detail": f"{quantity} x Air Filter A",
                    },
                    {"type": "amount_paid", "confidence": confidence, "value": total},
                ]
            },
        },
    }


def signature(confidence: float = 0.98):
    return {
        "type": "signature",
        "filename": "signature.png",
        "text": "customer signature",
        "uploaded_by": "TECH-004",
        "metadata": {
            "fixture_reading": {
                "observations": [{"type": "signature_present", "confidence": confidence}]
            }
        },
    }


def voice(text: str, quantity: int, confidence: float = 0.92):
    return {
        "type": "voice_note",
        "filename": "note.m4a",
        "text": text,
        "uploaded_by": "TECH-004",
        "metadata": {
            "fixture_reading": {
                "transcript": text,
                "observations": [
                    {
                        "type": "spoken_statement",
                        "confidence": confidence,
                        "component": PART,
                        "quantity": quantity,
                        "detail": text,
                    }
                ],
            }
        },
    }


def job(job_id: str, authorized: int, *, allowance: float = 0.0, base: float = 300.0):
    return {
        "id": job_id,
        "customer_id": "CUS-001",
        "technician_id": "TECH-004",
        "technician_name": "Daniel",
        "description": f"Replace {authorized} x Air Filter A - rooftop HVAC unit",
        "site_address": "1400 Harbour Way",
        "authorized_amount": base,
        "max_additional_spend_without_approval": allowance,
        "requirements": [
            {"type": "photo_before", "description": "Before photo of the HVAC unit"},
            {"type": "photo_after", "description": "After photo showing the installed filters"},
            {"type": "parts_receipt", "description": "Parts receipt"},
            {"type": "customer_signature", "description": "Customer signature"},
            {
                "type": "installation_quantity",
                "description": f"Install {authorized} x Air Filter A",
                "expected_quantity": authorized,
                "part_number": PART,
            },
        ],
    }


def scenario(
    job_id: str,
    family: str,
    description: str,
    *,
    authorized: int = 2,
    evidence: list,
    followup: list | None = None,
    expected: dict,
    allowance: float = 0.0,
):
    return {
        "name": family,
        "description": description,
        "job": job(job_id, authorized, allowance=allowance),
        "evidence": evidence,
        "followup_evidence": followup or [],
        "expected": expected,
    }


def build() -> list[dict]:
    out: list[dict] = []

    # -- Happy cases ------------------------------------------------------
    for n, job_id in enumerate(("JOB-2001", "JOB-2002", "JOB-2003"), start=1):
        out.append(
            scenario(
                job_id,
                "happy",
                "Everything correct; closes with no human involvement at all.",
                authorized=n,
                evidence=[
                    photo("before"),
                    photo("after", quantity=n, confidence=0.96),
                    receipt(n),
                    signature(),
                ],
                expected={
                    "technician_requests": 0,
                    "supervisor_decisions": 0,
                    "final_status": "CLOSED",
                },
            )
        )

    # -- Missing evidence -------------------------------------------------
    out.append(
        scenario(
            "JOB-2010",
            "missing-evidence",
            "No after photo at all. FieldProof requests it, then closes.",
            evidence=[photo("before"), receipt(2), signature()],
            followup=[photo("after", quantity=2, confidence=0.96)],
            expected={
                "technician_requests": 1,
                "supervisor_decisions": 0,
                "final_status": "CLOSED",
            },
        )
    )
    out.append(
        scenario(
            "JOB-2011",
            "missing-evidence",
            "No customer signature. Recovered autonomously.",
            evidence=[photo("before"), photo("after", quantity=2), receipt(2)],
            followup=[signature()],
            expected={
                "technician_requests": 1,
                "supervisor_decisions": 0,
                "final_status": "CLOSED",
            },
        )
    )

    # -- Contradiction ----------------------------------------------------
    out.append(
        scenario(
            "JOB-2020",
            "contradiction",
            "Technician says three; receipt says two. A voice note cannot establish "
            "an installation on its own (PRD 25).",
            evidence=[
                photo("before"),
                photo("after", quantity=2, confidence=0.95),
                receipt(2),
                signature(),
                voice("Replaced all three filters.", 3),
            ],
            expected={
                "technician_requests": 0,
                "supervisor_decisions": 0,
                "final_status": "CLOSED",
                "note": "voice note corroborates only; verified quantity stays 2",
            },
        )
    )
    out.append(
        scenario(
            "JOB-2021",
            "contradiction",
            "Receipt shows three purchased but only two installed.",
            evidence=[
                photo("before"),
                photo("after", quantity=2, confidence=0.95),
                receipt(3),
                signature(),
            ],
            followup=[photo("after", quantity=3, confidence=0.95)],
            expected={
                "technician_requests": 1,
                "supervisor_decisions": 1,
                "final_status": "CLOSED",
            },
        )
    )

    out.extend(_scope_and_quality())
    out.extend(_recovery_and_limits())
    return out


def _scope_and_quality() -> list[dict]:
    """Unauthorized work and evidence-quality families."""
    return [
        scenario(
            "JOB-2030",
            "unauthorized-work",
            "Three installed, two authorized, no allowance. One supervisor decision.",
            evidence=[
                photo("before"),
                photo("after", quantity=3, confidence=0.96),
                receipt(3),
                signature(),
                voice("Third one was badly damaged so I replaced it.", 3),
            ],
            expected={
                "technician_requests": 0,
                "supervisor_decisions": 1,
                "financial_impact": UNIT_PRICE,
                "final_status": "CLOSED",
            },
        ),
        scenario(
            "JOB-2031",
            "unauthorized-work",
            "Same overage, but inside a pre-authorized allowance. Auto-resolved with "
            "no human involved.",
            allowance=100.0,
            evidence=[
                photo("before"),
                photo("after", quantity=3, confidence=0.96),
                receipt(3),
                signature(),
            ],
            expected={
                "technician_requests": 0,
                "supervisor_decisions": 0,
                "final_status": "CLOSED",
            },
        ),
        scenario(
            "JOB-2040",
            "bad-evidence",
            "Blurry after photo below the 0.70 confidence floor. A clearer one is "
            "requested rather than trusted (PRD 26).",
            evidence=[
                photo("before"),
                photo(
                    "after",
                    quantity=2,
                    confidence=0.42,
                    detail="motion blur, filters not distinguishable",
                ),
                receipt(2),
                signature(),
            ],
            followup=[photo("after", quantity=2, confidence=0.96)],
            expected={
                "technician_requests": 1,
                "supervisor_decisions": 0,
                "final_status": "CLOSED",
            },
        ),
        scenario(
            "JOB-2041",
            "bad-evidence",
            "Borderline 0.71 confidence - just above the floor, verifies without a human.",
            evidence=[
                photo("before"),
                photo("after", quantity=2, confidence=0.71),
                receipt(2),
                signature(),
            ],
            expected={
                "technician_requests": 0,
                "supervisor_decisions": 0,
                "final_status": "CLOSED",
            },
        ),
        scenario(
            "JOB-2050",
            "duplicate-submission",
            "The same receipt uploaded twice must not become six filters (INV-005).",
            evidence=[
                photo("before"),
                photo("after", quantity=2),
                receipt(2),
                receipt(2, filename="receipt-copy.pdf"),
                signature(),
            ],
            expected={
                "technician_requests": 0,
                "supervisor_decisions": 0,
                "final_status": "CLOSED",
                "note": "duplicate raises an INFO conflict only",
            },
        ),
    ]


def _recovery_and_limits() -> list[dict]:
    """Rejection, resumption and the case that must never close."""
    return [
        scenario(
            "JOB-2060",
            "human-rejection",
            "Supervisor denies the additional cost. The work closes at the authorized "
            "amount and the overage is never billed (INV-004).",
            evidence=[
                photo("before"),
                photo("after", quantity=3, confidence=0.96),
                receipt(3),
                signature(),
            ],
            expected={
                "supervisor_decisions": 1,
                "decision": "REJECT",
                "final_status": "CLOSED",
                "final_amount": 300.0,
            },
        ),
        scenario(
            "JOB-2070",
            "resumption",
            "Evidence arrives only after the workflow has paused; it resumes on the "
            "event with no supervisor action (PRD FR-12).",
            evidence=[photo("before"), receipt(2), signature()],
            followup=[photo("after", quantity=2, confidence=0.96)],
            expected={
                "technician_requests": 1,
                "supervisor_decisions": 0,
                "final_status": "CLOSED",
            },
        ),
        scenario(
            "JOB-2071",
            "resumption",
            "Two consecutive pauses: missing evidence first, then a scope decision.",
            evidence=[photo("before"), receipt(3), signature()],
            followup=[photo("after", quantity=3, confidence=0.96)],
            expected={
                "technician_requests": 1,
                "supervisor_decisions": 1,
                "final_status": "CLOSED",
            },
        ),
        scenario(
            "JOB-2080",
            "incomplete-work",
            "Only one of two filters installed and no further evidence exists. The job "
            "must never reach CLOSED (INV-001, INV-002).",
            evidence=[
                photo("before"),
                photo("after", quantity=1, confidence=0.96),
                receipt(1),
                signature(),
            ],
            expected={
                "final_status": "WAITING_FOR_EVIDENCE",
                "note": "no evidence exists for the second installation",
            },
        ),
    ]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    written = 0
    for fixture in build():
        job_id = fixture["job"]["id"]
        if job_id in HAND_WRITTEN:
            continue
        (OUT / f"{job_id}.json").write_text(
            json.dumps(fixture, indent=2) + "\n", encoding="utf-8"
        )
        written += 1
    total = len(list(OUT.glob("*.json")))
    print(f"wrote {written} fixtures ({total} total in {OUT})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
