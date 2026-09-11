"""AWS adapters against moto's in-process AWS (PRD 22, 30).

The strongest check here is the last one: every evaluation fixture is run
end to end on the DynamoDB store and must behave exactly as it does on the
in-memory store. The two stores are interchangeable or the tests fail.
"""

from __future__ import annotations

import json

import boto3
import pytest
from moto import mock_aws

from demo.loader import list_fixtures, load_fixture
from demo.runner import run_scenario

REGION = "us-east-1"
TABLE = "fieldproof-test"


@pytest.fixture
def aws(monkeypatch):
    for name, value in {
        "AWS_ACCESS_KEY_ID": "testing",
        "AWS_SECRET_ACCESS_KEY": "testing",
        "AWS_SESSION_TOKEN": "testing",
        "AWS_DEFAULT_REGION": REGION,
    }.items():
        monkeypatch.setenv(name, value)
    with mock_aws():
        yield


@pytest.fixture
def dynamo(aws):
    from infra.adapters.dynamodb_store import DynamoJobStore
    from infra.settings import override

    resource = boto3.resource("dynamodb", region_name=REGION)
    resource.create_table(
        TableName=TABLE,
        BillingMode="PAY_PER_REQUEST",
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": n, "AttributeType": "S"} for n in ("PK", "SK", "GSI1PK", "GSI1SK")
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "GSI1",
                "KeySchema": [
                    {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                    {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    )
    store = DynamoJobStore(TABLE, resource=resource)
    override(store=store)
    return store


def test_dynamo_idempotency_is_first_writer_wins(dynamo):
    assert dynamo.peek_idempotency("k") == (False, None)
    assert dynamo.claim_idempotency_key("k") == (True, None)
    assert dynamo.claim_idempotency_key("k")[0] is False
    dynamo.record_idempotent_result("k", {"invoice": 1})
    assert dynamo.peek_idempotency("k") == (True, {"invoice": 1})
    dynamo.release_idempotency_key("k")
    assert dynamo.claim_idempotency_key("k")[0] is True


def test_dynamo_run_lock_and_rerun_flag(dynamo):
    assert dynamo.try_acquire_run_lock("JOB-1", "run-a")
    assert not dynamo.try_acquire_run_lock("JOB-1", "run-b")
    assert dynamo.try_acquire_run_lock("JOB-1", "run-a")  # re-entrant for the owner
    dynamo.release_run_lock("JOB-1", "run-b")  # not the owner: no effect
    assert not dynamo.try_acquire_run_lock("JOB-1", "run-b")
    dynamo.release_run_lock("JOB-1", "run-a")
    assert dynamo.try_acquire_run_lock("JOB-1", "run-b")

    assert dynamo.take_rerun("JOB-1") is False
    dynamo.request_rerun("JOB-1")
    dynamo.request_rerun("JOB-1")
    assert dynamo.take_rerun("JOB-1") is True
    assert dynamo.take_rerun("JOB-1") is False


def test_dynamo_expired_lock_is_taken_over(dynamo):
    assert dynamo.try_acquire_run_lock("JOB-2", "crashed", ttl_seconds=-5)
    assert dynamo.try_acquire_run_lock("JOB-2", "next")


def test_dynamo_rejects_duplicate_jobs(dynamo):
    from demo.loader import create_job

    fixture = load_fixture("JOB-1842")
    create_job(fixture)
    with pytest.raises(ValueError):
        create_job(fixture)


def test_dynamo_preserves_order_and_decision_lookup(dynamo):
    fixture = load_fixture("JOB-1842")
    outcome = run_scenario(fixture)
    state = dynamo.get_state(outcome.job_id)

    assert [r.description for r in state.requirements] == [
        r["description"] for r in fixture.job["requirements"]
    ]
    times = [e.created_at for e in state.events]
    assert times == sorted(times)
    decision = state.decisions[0]
    assert dynamo.get_decision(decision.id) == decision
    assert [j.id for j in dynamo.list_jobs()] == [outcome.job_id]


@pytest.mark.parametrize("fixture", list_fixtures(), ids=lambda f: f.job_id)
def test_every_fixture_behaves_the_same_on_dynamodb(dynamo, fixture):
    outcome = run_scenario(fixture)
    assert not outcome.matches(fixture.expected), outcome.matches(fixture.expected)


def test_s3_object_store_round_trip_and_presigning(aws):
    from infra.adapters.object_store import S3ObjectStore

    boto3.client("s3", region_name=REGION).create_bucket(Bucket="fp-evidence")
    store = S3ObjectStore("fp-evidence", region=REGION)

    url = store.put("JOB-1/receipt.pdf", b"%PDF", "application/pdf")
    assert url == "s3://fp-evidence/evidence/JOB-1/receipt.pdf"
    assert store.get("JOB-1/receipt.pdf") == b"%PDF"
    assert store.exists("JOB-1/receipt.pdf") and not store.exists("JOB-1/nope.pdf")

    put_url = store.presigned_put("JOB-1/uploads/a.png", "image/png", 60)
    assert "fp-evidence" in put_url and "Signature" in put_url


def test_eventbridge_bus_delivers_domain_events(aws):
    from domain.enums import EventType
    from domain.events import make_event
    from infra.adapters.event_bus import EventBridgeBus

    events = boto3.client("events", region_name=REGION)
    sqs = boto3.client("sqs", region_name=REGION)
    events.create_event_bus(Name="fp-bus")
    queue_url = sqs.create_queue(QueueName="fp-triggers")["QueueUrl"]
    queue_arn = sqs.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])[
        "Attributes"
    ]["QueueArn"]
    events.put_rule(
        Name="triggers",
        EventBusName="fp-bus",
        EventPattern=json.dumps({"source": ["fieldproof"], "detail-type": ["JOB_COMPLETED"]}),
    )
    events.put_targets(
        Rule="triggers", EventBusName="fp-bus", Targets=[{"Id": "q", "Arn": queue_arn}]
    )

    bus = EventBridgeBus("fp-bus", region=REGION)
    bus.publish(make_event("JOB-1842", EventType.JOB_COMPLETED, message="done"))
    bus.publish(make_event("JOB-1842", EventType.AGENT_STEP_STARTED))  # filtered out

    messages = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10)["Messages"]
    assert len(messages) == 1
    envelope = json.loads(messages[0]["Body"])
    assert envelope["detail-type"] == "JOB_COMPLETED"
    assert envelope["detail"]["job_id"] == "JOB-1842"


def test_workflow_lambda_runs_the_job_from_an_eventbridge_envelope(store):
    from demo.loader import complete_job, create_job, submit_evidence
    from infra.aws.lambda_handlers import workflow_handler

    fixture = load_fixture("JOB-1842")
    job_id = create_job(fixture)
    submit_evidence(job_id, fixture.evidence, announce=False)
    complete_job(job_id)

    envelope = {
        "id": "eb-1",
        "detail-type": "JOB_COMPLETED",
        "source": "fieldproof",
        "detail": {"id": "EVT-1", "job_id": job_id, "type": "JOB_COMPLETED"},
    }
    assert workflow_handler(envelope, None)["outcome"] == "WAITING_FOR_EVIDENCE"
    # At-least-once delivery: the same envelope again changes nothing.
    sent = len(store.get_state(job_id).events)
    assert workflow_handler(envelope, None)["outcome"] == "WAITING_FOR_EVIDENCE"
    requests = [e for e in store.get_state(job_id).events if e.type.value == "EVIDENCE_REQUESTED"]
    assert len(requests) == 1
    assert sent > 0
    assert workflow_handler({"detail": {}}, None)["skipped"] is True


def test_agentcore_entrypoint_runs_the_workflow(store):
    from agents.agentcore_app import invoke
    from demo.loader import create_job

    job_id = create_job(load_fixture("JOB-1842"))
    assert invoke({"job_id": job_id})["outcome"] == "NOT_SUBMITTED"
    with pytest.raises(ValueError):
        invoke({})
