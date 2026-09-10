"""Closed vocabularies for the FieldProof domain.

Every string that crosses an agent/tool boundary should be one of these values.
Free-form strings from an LLM must be coerced here before they can influence a
decision (PRD 18 - Deterministic Safety Boundary).
"""

from enum import StrEnum


class JobStatus(StrEnum):
    """PRD 20 - Workflow State Machine."""

    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    VERIFYING = "VERIFYING"
    WAITING_FOR_EVIDENCE = "WAITING_FOR_EVIDENCE"
    WAITING_FOR_DECISION = "WAITING_FOR_DECISION"
    VERIFIED = "VERIFIED"
    CLOSING = "CLOSING"
    CLOSED = "CLOSED"
    FAILED = "FAILED"


class RequirementStatus(StrEnum):
    """PRD FR-07."""

    VERIFIED = "VERIFIED"
    PARTIAL = "PARTIAL"
    UNSUPPORTED = "UNSUPPORTED"
    CONTRADICTED = "CONTRADICTED"
    NOT_REQUIRED = "NOT_REQUIRED"


class RequirementType(StrEnum):
    INSTALLATION_QUANTITY = "installation_quantity"
    PHOTO_BEFORE = "photo_before"
    PHOTO_AFTER = "photo_after"
    CUSTOMER_SIGNATURE = "customer_signature"
    PARTS_RECEIPT = "parts_receipt"
    TASK_COMPLETED = "task_completed"
    SAFETY_FORM = "safety_form"


class EvidenceType(StrEnum):
    IMAGE = "image"
    VIDEO = "video"
    RECEIPT = "receipt"
    SIGNATURE = "signature"
    PDF = "pdf"
    SENSOR_READING = "sensor_reading"
    VOICE_NOTE = "voice_note"
    CHECKLIST = "checklist"


class ClaimType(StrEnum):
    PART_PURCHASED = "part_purchased"
    PART_INSTALLED = "part_installed"
    CUSTOMER_ACCEPTED = "customer_accepted"
    SITE_VISITED = "site_visited"
    PRICE_PAID = "price_paid"
    TECHNICIAN_STATEMENT = "technician_statement"
    TASK_COMPLETED = "task_completed"


class ClaimStatus(StrEnum):
    PROPOSED = "PROPOSED"
    SUPPORTED = "SUPPORTED"
    UNSUPPORTED = "UNSUPPORTED"
    CONTRADICTED = "CONTRADICTED"
    INVALIDATED = "INVALIDATED"  # INV-009: source artifact replaced or deleted


class LinkRelationship(StrEnum):
    """PRD 21 - ClaimEvidenceLinks."""

    SUPPORTS = "SUPPORTS"
    CONTRADICTS = "CONTRADICTS"
    PARTIALLY_SUPPORTS = "PARTIALLY_SUPPORTS"


class ConflictType(StrEnum):
    """PRD FR-09 - minimum detectable conflicts."""

    QUANTITY_MISMATCH = "quantity_mismatch"
    PRICE_MISMATCH = "price_mismatch"
    MISSING_ARTIFACT = "missing_artifact"
    UNSUPPORTED_COMPLETION_CLAIM = "unsupported_completion_claim"
    TASK_NOT_COMPLETED = "task_not_completed"
    SPENDING_LIMIT_VIOLATION = "spending_limit_violation"
    LOW_CONFIDENCE_EVIDENCE = "low_confidence_evidence"
    DUPLICATE_SUBMISSION = "duplicate_submission"


class ConflictSeverity(StrEnum):
    """PRD 27."""

    INFO = "INFO"
    WARNING = "WARNING"
    BLOCKING = "BLOCKING"


class ConflictStatus(StrEnum):
    OPEN = "OPEN"
    AUTO_RESOLVED = "AUTO_RESOLVED"
    HUMAN_APPROVED = "HUMAN_APPROVED"
    HUMAN_REJECTED = "HUMAN_REJECTED"


class PolicyOutcome(StrEnum):
    """PRD 16 - Agent 4 (Policy Agent) verdicts."""

    AUTO_RESOLVE = "AUTO_RESOLVE"
    REQUEST_EVIDENCE = "REQUEST_EVIDENCE"
    REQUIRE_HUMAN = "REQUIRE_HUMAN"
    BLOCK = "BLOCK"


class DecisionStatus(StrEnum):
    PENDING = "PENDING"
    RESOLVED = "RESOLVED"
    EXPIRED = "EXPIRED"


class DecisionAction(StrEnum):
    """PRD FR-11 - MVP decision actions."""

    APPROVE = "APPROVE"
    REJECT = "REJECT"
    REQUEST_CLARIFICATION = "REQUEST_CLARIFICATION"


class ActionType(StrEnum):
    """Side-effecting actions the Action Agent may propose (PRD 16, 24)."""

    REQUEST_EVIDENCE = "request_evidence"
    CREATE_CONFLICT = "create_conflict"
    CREATE_DECISION = "create_decision"
    INCREASE_INVOICE = "increase_invoice"
    GENERATE_REPORT = "generate_report"
    CREATE_INVOICE = "create_invoice"
    NOTIFY_CUSTOMER = "notify_customer"
    CLOSE_JOB = "close_job"


class ConfidenceBand(StrEnum):
    """PRD 26."""

    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class EventType(StrEnum):
    """PRD 19 - Event Architecture."""

    JOB_CREATED = "JOB_CREATED"
    JOB_COMPLETED = "JOB_COMPLETED"
    EVIDENCE_UPLOADED = "EVIDENCE_UPLOADED"
    EVIDENCE_PROCESSED = "EVIDENCE_PROCESSED"
    MISSING_EVIDENCE_DETECTED = "MISSING_EVIDENCE_DETECTED"
    EVIDENCE_REQUESTED = "EVIDENCE_REQUESTED"
    CONFLICT_DETECTED = "CONFLICT_DETECTED"
    DECISION_REQUESTED = "DECISION_REQUESTED"
    DECISION_RESOLVED = "DECISION_RESOLVED"
    JOB_VERIFIED = "JOB_VERIFIED"
    JOB_CLOSED = "JOB_CLOSED"
    # Operational events - carry the timeline / observability surface (PRD 35).
    AGENT_STEP_STARTED = "AGENT_STEP_STARTED"
    AGENT_STEP_COMPLETED = "AGENT_STEP_COMPLETED"
    ACTION_EXECUTED = "ACTION_EXECUTED"
    ACTION_FAILED = "ACTION_FAILED"
