/**
 * The reference scenario used on the landing page: JOB-1842 from
 * demo/fixtures/JOB-1842.json, with lines and numbers taken from a real run of
 * `python -m demo.run_demo`. Nothing here is invented; if the fixture or the
 * workflow changes, update this file from a fresh run.
 */

import type { EvidenceType, JobStatus } from "./types";

export const REFERENCE = {
  jobId: "JOB-1842",
  receiptId: "RCP-1842",
  description: "Replace 2 x Air Filter A - rooftop HVAC unit",
  site: "1400 Harbour Way, Unit 3",
  technician: "Daniel",
  supervisor: "Sarah",
  authorized: 300,
  allowance: 0,
  impact: 54,
  final: 354,
  expected: 2,
  observed: 3,
  part: "HVAC-FILTER-A",
  policyId: "POL-003",
  policy: "Parts installed outside the original approved scope require supervisor approval.",
  request:
    "Hi Daniel. I need one additional photo showing the third installed HVAC-FILTER-A before I can complete Job JOB-1842.",
  question: "3 units verified but only 2 were authorized for Install 2 x Air Filter A. Approve the additional 54.00?",
  conflict: "3 x HVAC-FILTER-A purchased but only 2 confirmed installed by compatible evidence.",
  metrics: {
    workflowSteps: 18,
    autonomous: 16,
    technicianRequests: 1,
    supervisorDecisions: 1,
    manualReviews: 0,
  },
} as const;

export interface ReferenceArtifact {
  filename: string;
  type: EvidenceType;
  /** Arrives after FieldProof asks for it. */
  followup?: boolean;
}

export const REFERENCE_EVIDENCE: ReferenceArtifact[] = [
  { filename: "before-unit.jpg", type: "image" },
  { filename: "receipt-parts.pdf", type: "receipt" },
  { filename: "after-install.jpg", type: "image" },
  { filename: "customer-signature.png", type: "signature" },
  { filename: "tech-note.m4a", type: "voice_note" },
  { filename: "after-install-third.jpg", type: "image", followup: true },
];

export type ReplayTone = "agent" | "person" | "waiting" | "blocking" | "verified";

export interface ReplayLine {
  text: string;
  who: "FieldProof" | "Daniel" | "Sarah";
  tone: ReplayTone;
  quote?: string;
  /** Job status after this line. */
  status?: JobStatus;
  /** The run stops here until a person acts. */
  pause?: "technician" | "supervisor";
  /** Marks evidence chips as read, or reveals the follow-up photo. */
  evidence?: "read" | "followup" | "reread";
}

export const REFERENCE_REPLAY: ReplayLine[] = [
  { text: "Technician completed job", who: "Daniel", tone: "person", status: "SUBMITTED" },
  { text: "FieldProof began verification", who: "FieldProof", tone: "agent", status: "VERIFYING" },
  { text: "5 evidence artifacts processed", who: "FieldProof", tone: "agent", evidence: "read" },
  { text: "3 filters purchased, only 2 confirmed installed", who: "FieldProof", tone: "waiting" },
  {
    text: "Technician contacted automatically",
    who: "FieldProof",
    tone: "waiting",
    quote: REFERENCE.request,
    status: "WAITING_FOR_EVIDENCE",
    pause: "technician",
  },
  { text: "New image received", who: "Daniel", tone: "person", evidence: "followup" },
  { text: "Verification resumed", who: "FieldProof", tone: "agent", status: "VERIFYING" },
  { text: "6 evidence artifacts processed", who: "FieldProof", tone: "agent", evidence: "reread" },
  {
    text: "Supervisor approval requested",
    who: "FieldProof",
    tone: "blocking",
    quote: REFERENCE.question,
    status: "WAITING_FOR_DECISION",
    pause: "supervisor",
  },
  { text: "Approved by Sarah", who: "Sarah", tone: "person" },
  { text: "Job verified", who: "FieldProof", tone: "verified", status: "VERIFIED" },
  { text: "Invoice updated: 354.00 ready to invoice", who: "FieldProof", tone: "agent" },
  { text: "Customer package created", who: "FieldProof", tone: "agent" },
  { text: "Job closed automatically", who: "FieldProof", tone: "verified", status: "CLOSED" },
  { text: "Receipt generated", who: "FieldProof", tone: "verified" },
];

/** domain/claims/compatibility.py - SUPPORTING and CORROBORATING. */
export const COMPATIBILITY = {
  part_installed: { establishes: ["image", "video", "sensor_reading"], corroborates: ["voice_note", "checklist", "receipt"] },
  part_purchased: { establishes: ["receipt", "pdf"], corroborates: ["voice_note", "checklist", "image"] },
  customer_accepted: { establishes: ["signature", "pdf"], corroborates: ["voice_note", "image"] },
  site_visited: { establishes: ["image", "video", "sensor_reading"], corroborates: ["voice_note", "checklist"] },
  price_paid: { establishes: ["receipt", "pdf"], corroborates: ["voice_note", "checklist"] },
  task_completed: { establishes: ["image", "video", "checklist", "sensor_reading"], corroborates: ["voice_note", "receipt"] },
  technician_statement: { establishes: ["voice_note", "checklist"], corroborates: [] },
} as const satisfies Record<string, { establishes: readonly EvidenceType[]; corroborates: readonly EvidenceType[] }>;

/** README "Where each invariant is enforced", grouped by what they protect. */
export const INVARIANTS = {
  execution: [
    { id: "INV-005", text: "A duplicate event never duplicates an action." },
    { id: "INV-006", text: "A paused workflow resumes exactly once." },
    { id: "INV-007", text: "Every action, and every refusal, is audited." },
    { id: "INV-010", text: "Agent output cannot bypass policy." },
  ],
  evidence: [
    { id: "INV-003", text: "Incompatible evidence cannot support a claim." },
    { id: "INV-008", text: "Every claim keeps its evidence references." },
    { id: "INV-009", text: "Replacing an artifact invalidates what was concluded from it." },
  ],
  closing: [
    { id: "INV-001", text: "No job closes while a blocking conflict is unresolved." },
    { id: "INV-002", text: "No requirement is silently skipped." },
  ],
  money: [{ id: "INV-004", text: "Money beyond the authorization needs a human approval." }],
} as const;
