import { Badge } from "./ui/badge";
import {
  ACTIVE_STATUSES,
  CONFLICT_STATUS,
  DECISION_STATUS,
  JOB_STATUS,
  REQUIREMENT_STATUS,
  SEVERITY,
} from "@/lib/vocabulary";
import type {
  ConflictSeverity,
  ConflictStatus,
  DecisionStatus,
  JobStatus,
  RequirementStatus,
} from "@/lib/types";

type Kind = "job" | "requirement" | "conflict" | "severity" | "decision";

const TABLES = {
  job: JOB_STATUS,
  requirement: REQUIREMENT_STATUS,
  conflict: CONFLICT_STATUS,
  severity: SEVERITY,
  decision: DECISION_STATUS,
} as const;

type StatusFor = {
  job: JobStatus;
  requirement: RequirementStatus;
  conflict: ConflictStatus;
  severity: ConflictSeverity;
  decision: DecisionStatus;
};

/**
 * The one way a status is shown. Wording and colour come from
 * lib/vocabulary.ts, so "Waiting on technician" is amber everywhere.
 */
export function StatusPill<K extends Kind>({
  kind,
  status,
  size,
  className,
}: {
  kind: K;
  status: StatusFor[K];
  size?: "sm" | "md";
  className?: string;
}) {
  const table = TABLES[kind] as Record<string, { label: string; tone: Parameters<typeof Badge>[0]["tone"]; hint?: string }>;
  const term = table[status] ?? { label: String(status), tone: "neutral" as const };
  const live = kind === "job" && ACTIVE_STATUSES.has(status as JobStatus);
  return (
    <Badge tone={term.tone} live={live} size={size} className={className} title={term.hint}>
      {term.label}
    </Badge>
  );
}
