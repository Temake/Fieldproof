"""The PRD 23 API, exercised over HTTP.

The event bus is synchronous in tests, so each request that publishes an event
has finished running the workflow by the time the response returns.
"""

from __future__ import annotations

import hashlib
import json

import pytest
from fastapi.testclient import TestClient

from demo.loader import load_fixture


@pytest.fixture
def client():
    from fieldproof_api.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def hero():
    return load_fixture("JOB-1842")


def _create(client, hero):
    response = client.post("/api/jobs", json=hero.job)
    assert response.status_code == 200, response.text
    return hero.job_id


def _upload(client, job_id, item):
    metadata = {k: v for k, v in item["metadata"].items() if k != "stage"}
    response = client.post(
        f"/api/jobs/{job_id}/evidence",
        files={"file": (item["filename"], item["text"].encode(), "application/octet-stream")},
        data={
            "type": item["type"],
            "uploaded_by": item["uploaded_by"],
            "stage": item["metadata"].get("stage") or "",
            "metadata": json.dumps(metadata),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _path(url: str) -> str:
    """Signed URLs are absolute; TestClient wants the path."""
    return "/" + url.split("://", 1)[-1].split("/", 1)[-1]


def test_hero_demo_over_http(client, hero):
    job_id = _create(client, hero)
    for item in hero.evidence:
        _upload(client, job_id, item)

    assert client.post(f"/api/jobs/{job_id}/complete").status_code == 200
    assert client.get(f"/api/jobs/{job_id}").json()["job"]["status"] == "WAITING_FOR_EVIDENCE"
    messages = client.get(f"/api/jobs/{job_id}/messages").json()
    assert "third installed" in messages[-1]["message"]

    _upload(client, job_id, hero.followup_evidence[0])
    state = client.get(f"/api/jobs/{job_id}").json()
    assert state["job"]["status"] == "WAITING_FOR_DECISION"

    decision_id = state["decisions"][0]["id"]
    card = client.get(f"/api/decisions/{decision_id}").json()
    assert card["decision"]["financial_impact"] == 54.0
    assert card["evidence"], "the decision card must carry its evidence"

    resolved = client.post(
        f"/api/decisions/{decision_id}", json={"decision": "APPROVE", "decided_by": "Sarah"}
    )
    assert resolved.status_code == 200

    state = client.get(f"/api/jobs/{job_id}").json()
    assert state["job"]["status"] == "CLOSED"
    assert state["job"]["final_amount"] == 354.0

    first = client.get(f"/api/jobs/{job_id}/receipt").json()
    second = client.get(f"/api/jobs/{job_id}/receipt").json()
    assert first == second, "a sealed receipt must not change between reads"
    assert first["provisional"] is False
    assert client.get(f"/api/jobs/{job_id}/receipt/verify").json()["valid"] is True

    runs = client.get(f"/api/jobs/{job_id}/runs").json()
    assert len(runs) >= 3
    assert all(r["duration_ms"] >= 0 for r in runs)
    assert any("close_job" in r["tools_called"] for r in runs)

    metrics = client.get(f"/api/jobs/{job_id}/metrics").json()
    assert metrics["technician_interactions"] == 1
    assert metrics["supervisor_decisions"] == 1


def test_signed_upload_url_flow(client, hero):
    job_id = _create(client, hero)
    grant = client.post(
        f"/api/jobs/{job_id}/evidence/upload-url",
        json={"filename": "after photo.png", "content_type": "image/png"},
    ).json()
    assert grant["method"] == "PUT"
    path = _path(grant["upload_url"])

    assert client.put(path, content=b"png-bytes").status_code == 204
    assert client.put(path[:-4] + "0000", content=b"x").status_code == 403

    body = {"key": grant["key"], "type": "image", "filename": "after photo.png",
            "uploaded_by": "TECH-004", "stage": "after"}
    confirmed = client.post(f"/api/jobs/{job_id}/evidence/confirm", json=body)
    assert confirmed.status_code == 201, confirmed.text
    assert confirmed.json()["sha256"] == hashlib.sha256(b"png-bytes").hexdigest()
    assert client.post(f"/api/jobs/{job_id}/evidence/confirm", json=body).status_code == 409


def test_confirm_rejects_keys_from_another_job(client, hero):
    job_id = _create(client, hero)
    body = {"key": "JOB-OTHER/uploads/abc-x.png", "type": "image",
            "filename": "x.png", "uploaded_by": "T"}
    assert client.post(f"/api/jobs/{job_id}/evidence/confirm", json=body).status_code == 403


def test_expired_upload_url_is_refused(client, hero, env):
    env(FIELDPROOF_UPLOAD_URL_TTL="-1")
    job_id = _create(client, hero)
    grant = client.post(f"/api/jobs/{job_id}/evidence/upload-url", json={"filename": "a.png"})
    assert client.put(_path(grant.json()["upload_url"]), content=b"late").status_code == 403


def test_api_key_is_enforced_when_configured(client, env):
    env(FIELDPROOF_API_KEY="s3cret")
    assert client.get("/api/jobs").status_code == 401
    assert client.get("/api/jobs", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/api/jobs", headers={"Authorization": "Bearer s3cret"}).status_code == 200
    assert client.get("/health").status_code == 200


def test_replacing_evidence_supersedes_the_old_artifact(client, hero):
    job_id = _create(client, hero)
    old = _upload(client, job_id, hero.evidence[1])
    replace = f"/api/jobs/{job_id}/evidence/{old['id']}/replace"
    response = client.post(
        replace,
        files={"file": ("receipt-v2.pdf", b"clearer receipt", "application/pdf")},
        data={"uploaded_by": "TECH-004"},
    )
    assert response.status_code == 201, response.text
    state = client.get(f"/api/jobs/{job_id}").json()
    replaced = next(e for e in state["evidence"] if e["id"] == old["id"])
    assert replaced["superseded_by"] == response.json()["id"]

    twice = client.post(
        replace,
        files={"file": ("again.pdf", b"x", "application/pdf")},
        data={"uploaded_by": "TECH-004"},
    )
    assert twice.status_code == 409


def test_upload_validation(client, hero, env):
    env(FIELDPROOF_MAX_UPLOAD_MB="0.00001")  # about 10 bytes
    job_id = _create(client, hero)
    too_big = client.post(
        f"/api/jobs/{job_id}/evidence",
        files={"file": ("big.png", b"x" * 64, "image/png")},
        data={"type": "image", "uploaded_by": "TECH-004"},
    )
    assert too_big.status_code == 413
    bad_stage = client.post(
        f"/api/jobs/{job_id}/evidence",
        files={"file": ("a.png", b"x", "image/png")},
        data={"type": "image", "uploaded_by": "TECH-004", "stage": "during"},
    )
    assert bad_stage.status_code == 400


def test_duplicate_job_ids_are_rejected(client, hero):
    _create(client, hero)
    assert client.post("/api/jobs", json=hero.job).status_code == 409


def _to_decision(client, hero):
    job_id = _create(client, hero)
    for item in hero.evidence:
        _upload(client, job_id, item)
    client.post(f"/api/jobs/{job_id}/complete")
    _upload(client, job_id, hero.followup_evidence[0])
    return job_id, client.get(f"/api/jobs/{job_id}").json()["decisions"][0]["id"]


def test_closed_jobs_refuse_new_evidence(client, hero):
    job_id, decision_id = _to_decision(client, hero)
    client.post(f"/api/decisions/{decision_id}", json={"decision": "APPROVE"})
    response = client.post(
        f"/api/jobs/{job_id}/evidence",
        files={"file": ("late.png", b"late", "image/png")},
        data={"type": "image", "uploaded_by": "TECH-004"},
    )
    assert response.status_code == 409


def test_invoice_outage_leaves_job_verified_until_retry(client, hero):
    """PRD 36 - JOB remains VERIFIED, invoice_action = FAILED; retry finishes it."""
    from infra.settings import get_invoice_provider

    job_id, decision_id = _to_decision(client, hero)
    get_invoice_provider().fail_next = 1
    client.post(f"/api/decisions/{decision_id}", json={"decision": "APPROVE"})

    job = client.get(f"/api/jobs/{job_id}").json()["job"]
    assert job["status"] == "VERIFIED"
    assert job["metadata"]["invoice_action"] == "FAILED"

    assert client.post(f"/api/jobs/{job_id}/retry").status_code == 202
    job = client.get(f"/api/jobs/{job_id}").json()["job"]
    assert job["status"] == "CLOSED"
    assert job["metadata"]["invoice_action"] == "SUBMITTED"
    assert client.post(f"/api/jobs/{job_id}/retry").status_code == 409
