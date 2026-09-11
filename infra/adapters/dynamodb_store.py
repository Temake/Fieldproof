"""DynamoDB JobStore (PRD 22 - single-table design).

One partition holds a whole job, so the workflow loads everything it needs in
a single Query:

    PK = JOB#<job_id>
    SK = JOB
         REQ#<nnn>                      requirement, in work-order order
         EVIDENCE#<created_at>#<id>     evidence, chronological
         CLAIM#<id>
         LINK#<claim_id>#<evidence_id>
         CONFLICT#<created_at>#<id>
         DECISION#<id>
         EVENT#<created_at>#<id>        timeline, chronological

Supporting items live in their own partitions:

    PK = DECISIONPTR#<decision_id>  SK = PTR   -> which job a decision is on
    PK = IDEM#<key>                 SK = IDEM  -> idempotency (PRD 33)
    PK = LOCK#<job_id>              SK = LOCK  -> one workflow run at a time
    PK = LOCK#<job_id>              SK = RERUN -> coalesced follow-up run

GSI1 (GSI1PK, GSI1SK) serves the dashboard and the supervisor queue:
    GSI1PK = JOBS       GSI1SK = <created_at>   on JOB items
    GSI1PK = DECISIONS  GSI1SK = <created_at>   on DECISION items

Model bodies are stored as JSON strings in `data`, which sidesteps DynamoDB's
Decimal handling and keeps the schema exactly the pydantic one.
"""

from __future__ import annotations

import json
import time
from typing import Any

from domain.models import (
    Claim,
    ClaimEvidenceLink,
    Conflict,
    Decision,
    Event,
    Evidence,
    Job,
    JobState,
    Requirement,
)

from .memory_store import JobNotFound

#: Idempotency records outlive any plausible retry window, then expire.
IDEMPOTENCY_TTL_SECONDS = 30 * 24 * 3600
_PENDING = "__pending__"


def _pk(job_id: str) -> str:
    return f"JOB#{job_id}"


def _ts(value) -> str:
    return value.isoformat()


class DynamoJobStore:
    def __init__(self, table_name: str, region: str | None = None, *, resource=None) -> None:
        import boto3
        from boto3.dynamodb.conditions import Attr, Key

        self._key, self._attr = Key, Attr
        dynamodb = resource or boto3.resource("dynamodb", region_name=region)
        self.table = dynamodb.Table(table_name)
        self._errors = self.table.meta.client.exceptions

    # -- low-level helpers ------------------------------------------------
    def _put(self, pk: str, sk: str, model, **extra: Any) -> None:
        self.table.put_item(Item={"PK": pk, "SK": sk, "data": model.model_dump_json(), **extra})

    def _query_prefix(self, pk: str, prefix: str | None = None) -> list[dict]:
        condition = self._key("PK").eq(pk)
        if prefix:
            condition &= self._key("SK").begins_with(prefix)
        items: list[dict] = []
        kwargs: dict[str, Any] = {"KeyConditionExpression": condition, "ConsistentRead": True}
        while True:
            page = self.table.query(**kwargs)
            items.extend(page["Items"])
            if "LastEvaluatedKey" not in page:
                return items
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]

    def _replace_prefix(self, pk: str, prefixes: tuple[str, ...], items: list[dict]) -> None:
        """Delete every item under the prefixes that is not in `items`, then write `items`."""
        keep = {item["SK"] for item in items}
        stale = [
            existing["SK"]
            for prefix in prefixes
            for existing in self._query_prefix(pk, prefix)
            if existing["SK"] not in keep
        ]
        with self.table.batch_writer() as batch:
            for sk in stale:
                batch.delete_item(Key={"PK": pk, "SK": sk})
            for item in items:
                batch.put_item(Item=item)

    def _require_job(self, job_id: str) -> None:
        found = self.table.get_item(Key={"PK": _pk(job_id), "SK": "JOB"}, ConsistentRead=True)
        if "Item" not in found:
            raise JobNotFound(job_id)

    # -- jobs -------------------------------------------------------------
    def create_job(self, job: Job, requirements: list[Requirement]) -> JobState:
        try:
            self.table.put_item(
                Item={
                    "PK": _pk(job.id),
                    "SK": "JOB",
                    "data": job.model_dump_json(),
                    "GSI1PK": "JOBS",
                    "GSI1SK": _ts(job.created_at),
                },
                ConditionExpression="attribute_not_exists(PK)",
            )
        except self._errors.ConditionalCheckFailedException:
            raise ValueError(f"job {job.id} already exists") from None
        self.save_requirements(job.id, requirements)
        return self.get_state(job.id)

    def get_state(self, job_id: str) -> JobState:
        items = self._query_prefix(_pk(job_id))
        by_kind: dict[str, list[str]] = {}
        job_data = None
        for item in items:
            sk = item["SK"]
            if sk == "JOB":
                job_data = item["data"]
            else:
                by_kind.setdefault(sk.split("#", 1)[0], []).append(item["data"])
        if job_data is None:
            raise JobNotFound(job_id)

        def load(kind: str, model):
            return [model.model_validate_json(data) for data in by_kind.get(kind, [])]

        return JobState(
            job=Job.model_validate_json(job_data),
            requirements=load("REQ", Requirement),
            evidence=load("EVIDENCE", Evidence),
            claims=load("CLAIM", Claim),
            links=load("LINK", ClaimEvidenceLink),
            conflicts=load("CONFLICT", Conflict),
            decisions=load("DECISION", Decision),
            events=load("EVENT", Event),
        )

    def list_jobs(self, status: str | None = None) -> list[Job]:
        items: list[dict] = []
        kwargs: dict[str, Any] = {
            "IndexName": "GSI1",
            "KeyConditionExpression": self._key("GSI1PK").eq("JOBS"),
            "ScanIndexForward": False,
        }
        while True:
            page = self.table.query(**kwargs)
            items.extend(page["Items"])
            if "LastEvaluatedKey" not in page:
                break
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        jobs = [Job.model_validate_json(item["data"]) for item in items]
        return [j for j in jobs if not status or j.status == status]

    def save_job(self, job: Job) -> Job:
        self.table.put_item(
            Item={
                "PK": _pk(job.id),
                "SK": "JOB",
                "data": job.model_dump_json(),
                "GSI1PK": "JOBS",
                "GSI1SK": _ts(job.created_at),
            }
        )
        return job

    def save_requirements(self, job_id: str, requirements: list[Requirement]) -> None:
        pk = _pk(job_id)
        self._replace_prefix(
            pk,
            ("REQ#",),
            [
                {"PK": pk, "SK": f"REQ#{i:03d}", "data": r.model_dump_json()}
                for i, r in enumerate(requirements)
            ],
        )

    # -- evidence ---------------------------------------------------------
    def add_evidence(self, evidence: Evidence) -> Evidence:
        return self.save_evidence(evidence)

    def save_evidence(self, evidence: Evidence) -> Evidence:
        self._require_job(evidence.job_id)
        self._put(
            _pk(evidence.job_id), f"EVIDENCE#{_ts(evidence.created_at)}#{evidence.id}", evidence
        )
        return evidence

    # -- claims and conflicts --------------------------------------------
    def replace_claims(
        self, job_id: str, claims: list[Claim], links: list[ClaimEvidenceLink]
    ) -> None:
        pk = _pk(job_id)
        items = [{"PK": pk, "SK": f"CLAIM#{c.id}", "data": c.model_dump_json()} for c in claims]
        items += [
            {
                "PK": pk,
                "SK": f"LINK#{link.claim_id}#{link.evidence_id}",
                "data": link.model_dump_json(),
            }
            for link in links
        ]
        self._replace_prefix(pk, ("CLAIM#", "LINK#"), items)

    def set_conflicts(self, job_id: str, conflicts: list[Conflict]) -> None:
        pk = _pk(job_id)
        self._replace_prefix(
            pk,
            ("CONFLICT#",),
            [
                {"PK": pk, "SK": f"CONFLICT#{_ts(c.created_at)}#{c.id}", "data": c.model_dump_json()}
                for c in conflicts
            ],
        )

    def save_conflict(self, conflict: Conflict) -> Conflict:
        pk = _pk(conflict.job_id)
        # created_at may have been refreshed by a merge; drop any older copy.
        for item in self._query_prefix(pk, "CONFLICT#"):
            if item["SK"].endswith(f"#{conflict.id}"):
                self.table.delete_item(Key={"PK": pk, "SK": item["SK"]})
        self._put(pk, f"CONFLICT#{_ts(conflict.created_at)}#{conflict.id}", conflict)
        return conflict

    # -- decisions --------------------------------------------------------
    def add_decision(self, decision: Decision) -> Decision:
        self.table.put_item(
            Item={"PK": f"DECISIONPTR#{decision.id}", "SK": "PTR", "job_id": decision.job_id}
        )
        return self.save_decision(decision)

    def save_decision(self, decision: Decision) -> Decision:
        self._put(
            _pk(decision.job_id),
            f"DECISION#{decision.id}",
            decision,
            GSI1PK="DECISIONS",
            GSI1SK=_ts(decision.created_at),
        )
        return decision

    def get_decision(self, decision_id: str) -> Decision | None:
        pointer = self.table.get_item(
            Key={"PK": f"DECISIONPTR#{decision_id}", "SK": "PTR"}, ConsistentRead=True
        ).get("Item")
        if pointer is None:
            return None
        item = self.table.get_item(
            Key={"PK": _pk(pointer["job_id"]), "SK": f"DECISION#{decision_id}"},
            ConsistentRead=True,
        ).get("Item")
        return Decision.model_validate_json(item["data"]) if item else None

    def list_decisions(self, status: str | None = None) -> list[Decision]:
        page = self.table.query(
            IndexName="GSI1",
            KeyConditionExpression=self._key("GSI1PK").eq("DECISIONS"),
            ScanIndexForward=False,
        )
        decisions = [Decision.model_validate_json(item["data"]) for item in page["Items"]]
        return [d for d in decisions if not status or d.status == status]

    # -- events -----------------------------------------------------------
    def append_event(self, event: Event) -> Event:
        self._put(_pk(event.job_id), f"EVENT#{_ts(event.created_at)}#{event.id}", event)
        return event

    def list_events(self, job_id: str) -> list[Event]:
        return [
            Event.model_validate_json(item["data"])
            for item in self._query_prefix(_pk(job_id), "EVENT#")
        ]

    # -- idempotency (PRD 33) ---------------------------------------------
    def peek_idempotency(self, key: str) -> tuple[bool, Any]:
        item = self.table.get_item(
            Key={"PK": f"IDEM#{key}", "SK": "IDEM"}, ConsistentRead=True
        ).get("Item")
        if item is None:
            return False, None
        return True, _load_result(item.get("result"))

    def claim_idempotency_key(self, key: str, result: Any = None) -> tuple[bool, Any]:
        """Conditional write: exactly one caller wins, even across Lambdas (INV-005)."""
        try:
            self.table.put_item(
                Item={
                    "PK": f"IDEM#{key}",
                    "SK": "IDEM",
                    "result": _dump_result(result),
                    "ttl": int(time.time()) + IDEMPOTENCY_TTL_SECONDS,
                },
                ConditionExpression="attribute_not_exists(PK)",
            )
            return True, result
        except self._errors.ConditionalCheckFailedException:
            return False, self.peek_idempotency(key)[1]

    def record_idempotent_result(self, key: str, result: Any) -> None:
        self.table.update_item(
            Key={"PK": f"IDEM#{key}", "SK": "IDEM"},
            UpdateExpression="SET #r = :r",
            ExpressionAttributeNames={"#r": "result"},
            ExpressionAttributeValues={":r": _dump_result(result)},
        )

    def release_idempotency_key(self, key: str) -> None:
        self.table.delete_item(Key={"PK": f"IDEM#{key}", "SK": "IDEM"})

    # -- workflow run lock (INV-006) --------------------------------------
    def try_acquire_run_lock(self, job_id: str, owner: str, ttl_seconds: float = 300) -> bool:
        now = time.time()
        try:
            self.table.put_item(
                Item={
                    "PK": f"LOCK#{job_id}",
                    "SK": "LOCK",
                    "owner": owner,
                    "expires_at": int(now + ttl_seconds),
                    "ttl": int(now + ttl_seconds + 3600),
                },
                ConditionExpression="attribute_not_exists(PK) OR expires_at < :now OR #o = :me",
                ExpressionAttributeNames={"#o": "owner"},
                ExpressionAttributeValues={":now": int(now), ":me": owner},
            )
            return True
        except self._errors.ConditionalCheckFailedException:
            return False

    def release_run_lock(self, job_id: str, owner: str) -> None:
        try:
            self.table.delete_item(
                Key={"PK": f"LOCK#{job_id}", "SK": "LOCK"},
                ConditionExpression="#o = :me",
                ExpressionAttributeNames={"#o": "owner"},
                ExpressionAttributeValues={":me": owner},
            )
        except self._errors.ConditionalCheckFailedException:
            pass  # expired and taken over; nothing of ours to release

    def request_rerun(self, job_id: str) -> None:
        self.table.put_item(
            Item={"PK": f"LOCK#{job_id}", "SK": "RERUN", "ttl": int(time.time()) + 3600}
        )

    def take_rerun(self, job_id: str) -> bool:
        old = self.table.delete_item(
            Key={"PK": f"LOCK#{job_id}", "SK": "RERUN"}, ReturnValues="ALL_OLD"
        )
        return "Attributes" in old


def _dump_result(result: Any) -> str:
    return _PENDING if result is None else json.dumps(result, default=str)


def _load_result(raw: str | None) -> Any:
    if raw is None or raw == _PENDING:
        return None
    return json.loads(raw)
