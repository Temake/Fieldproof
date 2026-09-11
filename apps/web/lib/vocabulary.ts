/**
 * Human wording and semantic tone for every closed vocabulary the API returns.
 *
 * Tone is the whole colour system: "agent" when FieldProof is acting,
 * "waiting" when the technician owes something, "blocking" when a supervisor
 * does (or something failed), "verified" when it is proven or done.
 */

import type {
  ClaimType,
  ConflictSeverity,
  ConflictStatus,
  ConflictType,
  DecisionAction,
  DecisionStatus,
  EvidenceType,
  JobStatus,
  RequirementStatus,
  RequirementType,
  WorkflowNode,
} from "./types";

export type Tone = "agent" | "verified" | "waiting" | "blocking" | "neutral";

interface Term {
  label: string;
  tone: Tone;
  hint?: string;
}

export const JOB_STATUS: Record<JobStatus, Term> = {
  OPEN: { label: "Open", tone: "neutral", hint: "Work order created. Field work has not started." },
  IN_PROGRESS: { label: "In progress", tone: "neutral", hint: "The technician is on site." },
  SUBMITTED: { label: "Submitted", tone: "agent", hint: "The technician finished. Verification is starting." },
  VERIFYING: { label: "Verifying", tone: "agent", hint: "FieldProof is checking the evidence." },
  WAITING_FOR_EVIDENCE: {
    label: "Waiting on technician",
    tone: "waiting",
    hint: "FieldProof asked the technician for something it needs.",
  },
  WAITING_FOR_DECISION: {
    label: "Decision required",
    tone: "blocking",
    hint: "A supervisor has to answer one question before the job can close.",
  },
  VERIFIED: {
    label: "Verified",
    tone: "verified",
    hint: "The evidence checks out. Closeout actions are running or need a retry.",
  },
  CLOSING: { label: "Closing", tone: "agent", hint: "FieldProof is invoicing and sealing the receipt." },
  CLOSED: { label: "Closed", tone: "verified", hint: "Closed with a sealed evidence receipt." },
  FAILED: {
    label: "Paused on error",
    tone: "blocking",
    hint: "An internal error paused verification. It resumes on the next event or a retry.",
  },
};

/** Statuses in which FieldProof is actively working, so the UI polls fast. */
export const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set([
  "SUBMITTED",
  "VERIFYING",
  "VERIFIED",
  "CLOSING",
]);

export const REQUIREMENT_STATUS: Record<RequirementStatus, Term> = {
  VERIFIED: { label: "Verified", tone: "verified" },
  PARTIAL: { label: "Partial", tone: "waiting" },
  UNSUPPORTED: { label: "Unsupported", tone: "blocking" },
  CONTRADICTED: { label: "Contradicted", tone: "blocking" },
  NOT_REQUIRED: { label: "Not required", tone: "neutral" },
};

export const REQUIREMENT_TYPE: Record<RequirementType, { label: string; hint: string }> = {
  photo_before: { label: "Before photo", hint: "An image tagged as taken before the work." },
  photo_after: { label: "After photo", hint: "An image tagged as taken after the work." },
  parts_receipt: { label: "Parts receipt", hint: "A receipt for the parts used." },
  customer_signature: { label: "Customer signature", hint: "The customer's sign-off." },
  installation_quantity: {
    label: "Installation quantity",
    hint: "An authorized number of a specific part to install.",
  },
  task_completed: { label: "Task completed", hint: "Proof that a named task was done." },
  safety_form: { label: "Safety form", hint: "A completed safety document (PDF)." },
};

export const EVIDENCE_TYPE: Record<EvidenceType, { label: string; short: string }> = {
  image: { label: "Photo", short: "Photo" },
  video: { label: "Video", short: "Video" },
  receipt: { label: "Receipt", short: "Receipt" },
  signature: { label: "Signature", short: "Signature" },
  pdf: { label: "Document (PDF)", short: "PDF" },
  sensor_reading: { label: "Sensor reading", short: "Sensor" },
  voice_note: { label: "Voice note", short: "Voice note" },
  checklist: { label: "Checklist", short: "Checklist" },
};

export const CLAIM_TYPE: Record<ClaimType, string> = {
  part_installed: "Part installed",
  part_purchased: "Part purchased",
  customer_accepted: "Customer accepted",
  site_visited: "Site visited",
  price_paid: "Price paid",
  technician_statement: "Technician statement",
  task_completed: "Task completed",
};

export const CONFLICT_TYPE: Record<ConflictType, string> = {
  quantity_mismatch: "Quantity outside authorized scope",
  price_mismatch: "Price mismatch",
  missing_artifact: "Missing evidence",
  unsupported_completion_claim: "Unsupported completion claim",
  task_not_completed: "Task not completed",
  spending_limit_violation: "Spend above allowance",
  low_confidence_evidence: "Low-confidence evidence",
  duplicate_submission: "Duplicate submission",
};

export const CONFLICT_STATUS: Record<ConflictStatus, Term> = {
  OPEN: { label: "Open", tone: "blocking" },
  AWAITING_CLARIFICATION: { label: "Awaiting technician", tone: "waiting" },
  AUTO_RESOLVED: { label: "Resolved by policy", tone: "verified" },
  HUMAN_APPROVED: { label: "Approved", tone: "verified" },
  HUMAN_REJECTED: { label: "Rejected", tone: "blocking" },
  CLEARED: { label: "Cleared by evidence", tone: "neutral" },
};

export const SEVERITY: Record<ConflictSeverity, Term> = {
  INFO: { label: "Info", tone: "neutral" },
  WARNING: { label: "Warning", tone: "waiting" },
  BLOCKING: { label: "Blocking", tone: "blocking" },
};

export const DECISION_STATUS: Record<DecisionStatus, Term> = {
  PENDING: { label: "Pending", tone: "blocking" },
  RESOLVED: { label: "Resolved", tone: "verified" },
  EXPIRED: { label: "Withdrawn", tone: "neutral" },
};

export const DECISION_ACTION: Record<DecisionAction, Term & { verb: string }> = {
  APPROVE: { label: "Approved", verb: "Approve", tone: "verified" },
  REJECT: { label: "Rejected", verb: "Reject", tone: "blocking" },
  REQUEST_CLARIFICATION: {
    label: "Clarification requested",
    verb: "Request clarification",
    tone: "waiting",
  },
};

/** Receipt conflict resolutions, tools/reports/closeout.py RESOLUTION. */
export const RESOLUTION: Record<string, Term> = {
  UNRESOLVED: { label: "Unresolved", tone: "blocking" },
  AWAITING_CLARIFICATION: { label: "Awaiting technician", tone: "waiting" },
  CLEARED_BY_EVIDENCE: { label: "Cleared by evidence", tone: "neutral" },
  AUTO_RESOLVED: { label: "Resolved by policy", tone: "verified" },
  HUMAN_APPROVED: { label: "Approved by a supervisor", tone: "verified" },
  HUMAN_REJECTED: { label: "Rejected by a supervisor", tone: "blocking" },
};

export const WORKFLOW_NODE: Record<WorkflowNode, { label: string; hint: string }> = {
  LOAD_CONTEXT: { label: "Load context", hint: "Read the work order, policies and allowed actions." },
  PARSE_EVIDENCE: { label: "Parse evidence", hint: "Turn each artifact into observations." },
  RECONCILE: { label: "Reconcile", hint: "Requirements against claims against evidence." },
  POLICY_CHECK: { label: "Policy check", hint: "Decide what each conflict needs." },
  REQUEST_EVIDENCE: { label: "Ask technician", hint: "One message for everything missing." },
  HUMAN_DECISION: { label: "Ask supervisor", hint: "One question that needs a person." },
  ACTION: { label: "Close out", hint: "Report, invoice, customer package, receipt." },
  DONE: { label: "Done", hint: "The run ended." },
};

/** The four nodes every run passes through, in order. */
export const CORE_NODES: WorkflowNode[] = ["LOAD_CONTEXT", "PARSE_EVIDENCE", "RECONCILE", "POLICY_CHECK"];
/** Where a run can go after the policy check. */
export const BRANCH_NODES: WorkflowNode[] = ["REQUEST_EVIDENCE", "HUMAN_DECISION", "ACTION"];

export function actionLabel(action: string): string {
  const known: Record<string, string> = {
    request_evidence: "Evidence requested",
    request_clarification: "Clarification relayed",
    create_conflict: "Conflict recorded",
    create_decision: "Decision requested",
    increase_invoice: "Invoice increased",
    generate_report: "Closeout report",
    create_invoice: "Invoice submitted",
    notify_customer: "Customer notified",
    close_job: "Job closed",
    generate_receipt: "Receipt sealed",
    JOB_CLOSED: "Job closed",
    EVIDENCE_REQUESTED: "Evidence requested",
  };
  return known[action] ?? action.replaceAll("_", " ");
}
