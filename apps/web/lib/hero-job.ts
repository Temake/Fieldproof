/**
 * The job the landing hero closes: JOB-2002 from demo/fixtures/JOB-2002.json,
 * the "everything correct" scenario. Amounts, filenames, confidences and the
 * outcome come from a real `python -m demo.run_demo --fixture JOB-2002` run
 * (RCP-2002: CLOSED, 5/5 requirements verified, 300.00 ready to invoice,
 * 6 of 6 workflow steps autonomous).
 *
 * Two things are illustrative and not in the fixture: the technician's voice
 * note (the fixture has four artifacts, the hero shows five) and the customer
 * name, borrowed from the same customer's signature on JOB-1842.
 *
 * Photos: Pexels (free to use, no attribution required).
 *   before-photo.jpg  https://www.pexels.com/photo/30210086/
 *   after-photo.jpg   https://www.pexels.com/photo/6471913/
 */

import type { JobStatus } from "./types";

export const HERO_JOB = {
  jobId: "JOB-2002",
  receiptId: "RCP-2002",
  scope: "Replace 2 × Air Filter A",
  asset: "Rooftop HVAC unit",
  site: "1400 Harbour Way",
  customer: "M. Alvarez",
  technician: "Daniel",
  part: "HVAC-FILTER-A",
  quantity: 2,
  authorized: 300,
  final: 300,
  steps: 6,
  people: 0,
} as const;

export type ArtifactId = "before" | "after" | "signature" | "receipt" | "note";

export interface HeroArtifact {
  id: ArtifactId;
  filename: string;
  label: string;
}

/** Arrival order on site. */
export const HERO_ARTIFACTS: HeroArtifact[] = [
  { id: "before", filename: "before-photo.jpg", label: "Before photo" },
  { id: "after", filename: "after-photo.jpg", label: "After photo" },
  { id: "signature", filename: "signature.png", label: "Customer signature" },
  { id: "receipt", filename: "receipt.pdf", label: "Parts receipt" },
  { id: "note", filename: "tech-note.m4a", label: "Technician note" },
];

/** The five requirements on the work order (fixture `requirements`). */
export const HERO_REQUIREMENTS = [
  "Before photo of the unit",
  "After photo, filters installed",
  "Parts receipt",
  "Customer signature",
  "Install 2 × HVAC-FILTER-A",
] as const;

export interface HeroCheck {
  label: string;
  detail: string;
  /** Fixture confidence for the observation behind the check. */
  confidence?: number;
  /** The artifact pulled under inspection while the check runs. */
  inspects: ArtifactId | "order";
  /** Artifacts that count as verified once the check passes. */
  verifies: ArtifactId[];
  /** Work-order requirement rows ticked once the check passes. */
  ticks: number[];
}

export const HERO_CHECKS: HeroCheck[] = [
  {
    label: "Photo matches work order",
    detail: "Rooftop HVAC unit, 1400 Harbour Way",
    confidence: 0.95,
    inspects: "before",
    verifies: ["before"],
    ticks: [0],
  },
  {
    label: "Installation verified",
    detail: "2 of 2 HVAC-FILTER-A seated",
    confidence: 0.96,
    inspects: "after",
    verifies: ["after", "note"],
    ticks: [1],
  },
  {
    label: "Customer signature verified",
    detail: "Signed on site by M. Alvarez",
    confidence: 0.98,
    inspects: "signature",
    verifies: ["signature"],
    ticks: [3],
  },
  {
    label: "Materials verified",
    detail: "2 purchased, 2 installed, $108.00",
    confidence: 0.97,
    inspects: "receipt",
    verifies: ["receipt"],
    ticks: [2, 4],
  },
  {
    label: "Evidence complete",
    detail: "5 of 5 requirements met",
    inspects: "order",
    verifies: [],
    ticks: [],
  },
];

export const HERO_POLICY = [
  { label: "Requirements verified", value: "5 of 5" },
  { label: "Final amount vs authorized", value: "$300.00 / $300.00" },
  { label: "Blocking conflicts", value: "None" },
] as const;

export type Phase = "field" | "evidence" | "verify" | "decision" | "closed";

export const PHASES: { id: Phase; label: string }[] = [
  { id: "field", label: "Field work" },
  { id: "evidence", label: "Evidence" },
  { id: "verify", label: "Verification" },
  { id: "decision", label: "Decision" },
  { id: "closed", label: "Job closed" },
];

/**
 * The run, one beat at a time. Each beat holds for `ms` before the next.
 * Event names are the backend's EventType values (domain/enums.py).
 */
export interface Beat {
  phase: Phase;
  ms: number;
  status: JobStatus;
  event: string;
  subject?: string;
  /** Artifacts on the table after this beat. */
  arrived: number;
  /** Index of the check running during this beat, if any. */
  check?: number;
  /** Checks fully passed after this beat. */
  passed: number;
}

const ARRIVE_MS = 620;
const CHECK_MS = 1150;

export const HERO_BEATS: Beat[] = [
  { phase: "field", ms: 700, status: "IN_PROGRESS", event: "JOB_CREATED", subject: "JOB-2002", arrived: 0, passed: 0 },
  { phase: "field", ms: 900, status: "IN_PROGRESS", event: "JOB_STATUS_CHANGED", subject: "Daniel on site", arrived: 0, passed: 0 },
  ...HERO_ARTIFACTS.map(
    (a, i): Beat => ({
      phase: "evidence",
      ms: i === HERO_ARTIFACTS.length - 1 ? 900 : ARRIVE_MS,
      status: "IN_PROGRESS",
      event: "EVIDENCE_UPLOADED",
      subject: a.filename,
      arrived: i + 1,
      passed: 0,
    }),
  ),
  { phase: "evidence", ms: 800, status: "SUBMITTED", event: "JOB_COMPLETED", subject: "by Daniel", arrived: 5, passed: 0 },
  { phase: "verify", ms: 900, status: "VERIFYING", event: "EVIDENCE_PROCESSED", subject: "5 artifacts", arrived: 5, passed: 0 },
  ...HERO_CHECKS.map(
    (c, i): Beat => ({
      phase: "verify",
      ms: CHECK_MS,
      status: "VERIFYING",
      event: "AGENT_STEP_COMPLETED",
      subject: c.label.toLowerCase(),
      arrived: 5,
      check: i,
      passed: i,
    }),
  ),
  { phase: "decision", ms: 2300, status: "VERIFIED", event: "JOB_VERIFIED", subject: "5/5 requirements", arrived: 5, passed: 5 },
  { phase: "closed", ms: 5200, status: "CLOSED", event: "JOB_CLOSED", subject: "RCP-2002 sealed", arrived: 5, passed: 5 },
];

export const FINAL_BEAT = HERO_BEATS.length - 1;
