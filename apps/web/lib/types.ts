/** Mirrors domain/models.py. Keep the two in step. */

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

export type ConflictSeverity = "INFO" | "WARNING" | "BLOCKING";
export type DecisionAction = "APPROVE" | "REJECT" | "REQUEST_CLARIFICATION";

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
  closed_at: string | null;
}

export interface Requirement {
  id: string;
  type: string;
  description: string;
  required: boolean;
  status: RequirementStatus;
  expected_quantity: number | null;
  part_number: string | null;
  supporting_claim_ids: string[];
  notes: string | null;
}

export interface Evidence {
  id: string;
  type: string;
  filename: string | null;
  sha256: string;
  uploaded_by: string;
  created_at: string;
  transcript: string | null;
  observations: { type: string; confidence: number; detail?: string | null }[];
  superseded_by: string | null;
}

export interface Claim {
  id: string;
  type: string;
  part_number: string | null;
  quantity: number | null;
  confidence: number;
  source_evidence_id: string | null;
}

export interface Conflict {
  id: string;
  type: string;
  severity: ConflictSeverity;
  description: string;
  status: string;
  financial_impact: number;
  expected_value: unknown;
  observed_value: unknown;
}

export interface Decision {
  id: string;
  job_id: string;
  conflict_id: string;
  question: string;
  recommended_action: DecisionAction;
  policy: string;
  financial_impact: number;
  evidence_ids: string[];
  status: "PENDING" | "RESOLVED" | "EXPIRED";
  decision: DecisionAction | null;
  decided_by: string | null;
  created_at: string;
}

export interface JobEvent {
  id: string;
  job_id: string;
  type: string;
  message: string | null;
  actor: string;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface JobState {
  job: Job;
  requirements: Requirement[];
  evidence: Evidence[];
  claims: Claim[];
  links: { claim_id: string; evidence_id: string; relationship: string; confidence: number }[];
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
  result: string;
  generated_at: string;
  requirements: { total: number; verified: number; detail: Requirement[] };
  claims: (Claim & { evidence: string[] })[];
  evidence: { id: string; type: string; sha256: string }[];
  conflicts: { id: string; type: string; severity: string; resolution: string }[];
  decisions: { id: string; question: string; decision: string | null; decided_by: string | null }[];
  actions: string[];
  final_amount: number | null;
  sha256: string;
}
