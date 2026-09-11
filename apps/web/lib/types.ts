/**
 * Wire types. Mirrors domain/models.py, domain/enums.py and
 * apps/api/fieldproof_api/schemas.py. Keep them in step.
 */

export type JobStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "VERIFYING"
  | "WAITING_FOR_EVIDENCE"
  | "WAITING_FOR_DECISION"
  | "VERIFIED"
  | "CLOSING"
  | "CLOSED"
  | "FAILED";

export type RequirementStatus =
  | "VERIFIED"
  | "PARTIAL"
  | "UNSUPPORTED"
  | "CONTRADICTED"
  | "NOT_REQUIRED";

export type RequirementType =
  | "installation_quantity"
  | "photo_before"
  | "photo_after"
  | "customer_signature"
  | "parts_receipt"
  | "task_completed"
  | "safety_form";

export type EvidenceType =
  | "image"
  | "video"
  | "receipt"
  | "signature"
  | "pdf"
  | "sensor_reading"
  | "voice_note"
  | "checklist";

export type ClaimType =
  | "part_purchased"
  | "part_installed"
  | "customer_accepted"
  | "site_visited"
  | "price_paid"
  | "technician_statement"
  | "task_completed";

export type ConflictType =
  | "quantity_mismatch"
  | "price_mismatch"
  | "missing_artifact"
  | "unsupported_completion_claim"
  | "task_not_completed"
  | "spending_limit_violation"
  | "low_confidence_evidence"
  | "duplicate_submission";

export type ConflictSeverity = "INFO" | "WARNING" | "BLOCKING";

export type ConflictStatus =
  | "OPEN"
  | "AWAITING_CLARIFICATION"
  | "AUTO_RESOLVED"
  | "HUMAN_APPROVED"
  | "HUMAN_REJECTED"
  | "CLEARED";

export type DecisionStatus = "PENDING" | "RESOLVED" | "EXPIRED";
export type DecisionAction = "APPROVE" | "REJECT" | "REQUEST_CLARIFICATION";
export type LinkRelationship = "SUPPORTS" | "CONTRADICTS" | "PARTIALLY_SUPPORTS";

export type EventType =
  | "JOB_CREATED"
  | "JOB_COMPLETED"
  | "EVIDENCE_UPLOADED"
  | "EVIDENCE_PROCESSED"
  | "MISSING_EVIDENCE_DETECTED"
  | "EVIDENCE_REQUESTED"
  | "CONFLICT_DETECTED"
  | "DECISION_REQUESTED"
  | "DECISION_RESOLVED"
  | "JOB_VERIFIED"
  | "JOB_CLOSED"
  | "JOB_STATUS_CHANGED"
  | "AGENT_STEP_STARTED"
  | "AGENT_STEP_COMPLETED"
  | "ACTION_EXECUTED"
  | "ACTION_FAILED"
  | "WORKFLOW_RETRY_REQUESTED"
  | "WORKFLOW_RUN_COMPLETED"
  | "WORKFLOW_RUN_FAILED";

/** Orchestrator nodes, agents/orchestrator/graph.py `Node`. */
export type WorkflowNode =
  | "LOAD_CONTEXT"
  | "PARSE_EVIDENCE"
  | "RECONCILE"
  | "POLICY_CHECK"
  | "REQUEST_EVIDENCE"
  | "HUMAN_DECISION"
  | "ACTION"
  | "DONE";

export type Metadata = Record<string, unknown>;

export interface Job {
  id: string;
  customer_id: string;
  technician_id: string;
  technician_name: string | null;
  status: JobStatus;
  description: string;
  site_address: string | null;
  authorized_amount: number;
  max_additional_spend_without_approval: number;
  final_amount: number | null;
  created_at: string;
  completed_at: string | null;
  closed_at: string | null;
  metadata: Metadata;
}

export interface Requirement {
  id: string;
  job_id: string;
  type: RequirementType;
  description: string;
  required: boolean;
  status: RequirementStatus;
  expected_quantity: number | null;
  part_number: string | null;
  supporting_claim_ids: string[];
  notes: string | null;
}

export interface Observation {
  type: string;
  confidence: number;
  component: string | null;
  quantity: number | null;
  value: unknown;
  detail: string | null;
}

export interface Evidence {
  id: string;
  job_id: string;
  type: EvidenceType;
  storage_url: string;
  sha256: string;
  uploaded_by: string;
  filename: string | null;
  content_type: string | null;
  created_at: string;
  processed_at: string | null;
  observations: Observation[];
  transcript: string | null;
  superseded_by: string | null;
  metadata: Metadata;
}

export interface Claim {
  id: string;
  job_id: string;
  type: ClaimType;
  source_evidence_id: string | null;
  source: string;
  part_number: string | null;
  quantity: number | null;
  amount: number | null;
  value: unknown;
  confidence: number;
  status: string;
  created_at: string;
}

export interface ClaimEvidenceLink {
  claim_id: string;
  evidence_id: string;
  relationship: LinkRelationship;
  confidence: number;
  rationale: string | null;
}

export interface Conflict {
  id: string;
  job_id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  description: string;
  status: ConflictStatus;
  policy_id: string | null;
  requirement_id: string | null;
  claim_ids: string[];
  evidence_ids: string[];
  financial_impact: number;
  expected_value: unknown;
  observed_value: unknown;
  created_at: string;
  resolved_at: string | null;
  resolution_decision_id: string | null;
}

export interface Decision {
  id: string;
  job_id: string;
  conflict_id: string;
  question: string;
  recommended_action: DecisionAction;
  policy: string;
  policy_id: string | null;
  financial_impact: number;
  evidence_ids: string[];
  requested_from: string;
  status: DecisionStatus;
  decision: DecisionAction | null;
  comment: string | null;
  decided_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface JobEvent {
  id: string;
  job_id: string;
  type: EventType;
  payload: Metadata;
  message: string | null;
  actor: string;
  idempotency_key: string | null;
  run_id: string | null;
  created_at: string;
}

export interface JobState {
  job: Job;
  requirements: Requirement[];
  evidence: Evidence[];
  claims: Claim[];
  links: ClaimEvidenceLink[];
  conflicts: Conflict[];
  decisions: Decision[];
  events: JobEvent[];
}

export interface DashboardCounts {
  processing: number;
  closed_automatically: number;
  waiting_on_technician: number;
  decision_required: number;
}

export interface Metrics {
  workflow_steps: number;
  handled_autonomously: number;
  technician_interactions: number;
  supervisor_decisions: number;
  manual_document_reviews: number;
  automation_rate: number;
}

/** GET /api/jobs/:id/runs - PRD 35. */
export interface WorkflowRun {
  type: "WORKFLOW_RUN_COMPLETED" | "WORKFLOW_RUN_FAILED";
  created_at: string;
  run_id: string;
  trigger: string | null;
  steps: WorkflowNode[];
  tools_called: string[];
  duration_ms: number;
  outcome: string;
  error: string | null;
}

/** GET /api/jobs/:id/messages - simulated delivery (PRD 39). */
export interface SentMessage {
  id: string;
  recipient: string;
  message: string;
}

export interface DecisionDetail {
  decision: Decision;
  conflict: Conflict | null;
  job: Job;
  evidence: Evidence[];
  claims: Claim[];
}

export interface Receipt {
  receipt_id: string;
  job_id: string;
  result: JobStatus;
  provisional: boolean;
  generated_at: string;
  requirements: {
    total: number;
    verified: number;
    detail: { id: string; description: string; status: RequirementStatus; supported_by: string[] }[];
  };
  claims: {
    id: string;
    type: ClaimType;
    part_number: string | null;
    quantity: number | null;
    confidence: number;
    evidence: string[];
  }[];
  evidence: { id: string; type: EvidenceType; sha256: string }[];
  conflicts: {
    id: string;
    type: ConflictType;
    severity: ConflictSeverity;
    resolution: string;
    decision_id: string | null;
  }[];
  decisions: {
    id: string;
    question: string;
    decision: DecisionAction | null;
    decided_by: string | null;
    policy: string;
  }[];
  actions: string[];
  final_amount: number | null;
  sha256: string;
}

export interface ReceiptVerification {
  receipt_id: string;
  sealed: boolean;
  sha256: string;
  valid: boolean;
}

// -- Requests ---------------------------------------------------------------

export interface RequirementIn {
  type: RequirementType;
  description: string;
  required: boolean;
  expected_quantity: number | null;
  part_number: string | null;
}

export interface JobIn {
  id?: string;
  customer_id: string;
  technician_id: string;
  technician_name?: string | null;
  description: string;
  site_address?: string | null;
  authorized_amount: number;
  max_additional_spend_without_approval: number;
  requirements: RequirementIn[];
  metadata?: Metadata;
}

export interface DecisionIn {
  decision: DecisionAction;
  comment?: string | null;
  decided_by: string;
}

export interface UploadUrl {
  upload_url: string;
  method: "PUT";
  headers: Record<string, string>;
  key: string;
  expires_in: number;
}
