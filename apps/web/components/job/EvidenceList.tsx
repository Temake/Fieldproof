"use client";

import { useState, type ReactNode } from "react";
import { ArrowSquareOut, HourglassMedium, WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import { blobUrl } from "@/lib/api/client";
import { cx } from "@/lib/cx";
import { dateTime, percent, shortHash } from "@/lib/format";
import type { Evidence, Job, Observation } from "@/lib/types";
import { EVIDENCE_TYPE } from "@/lib/vocabulary";
import { Badge } from "../ui/badge";
import { CopyButton } from "../ui/copy-button";
import { EVIDENCE_ICON } from "./evidence-icon";

/** POL-002: evidence below this confidence cannot verify a critical requirement. */
const CONFIDENCE_FLOOR = 0.7;

interface EvidenceListProps {
  evidence: Evidence[];
  job: Pick<Job, "technician_id" | "technician_name">;
  /** Optional per-item action, e.g. "Replace" in the technician view. */
  action?: (item: Evidence) => ReactNode;
  compact?: boolean;
}

export function EvidenceList({ evidence, job, action, compact = false }: EvidenceListProps) {
  const sorted = [...evidence].sort((a, b) => {
    if (!!a.superseded_by !== !!b.superseded_by) return a.superseded_by ? 1 : -1;
    return a.created_at.localeCompare(b.created_at);
  });

  return (
    <ul className={cx("grid gap-3", !compact && "md:grid-cols-2")}>
      {sorted.map((item) => (
        <EvidenceItem key={item.id} item={item} job={job} action={action?.(item)} />
      ))}
    </ul>
  );
}

function EvidenceItem({ item, job, action }: { item: Evidence; job: EvidenceListProps["job"]; action?: ReactNode }) {
  const Icon = EVIDENCE_ICON[item.type] ?? ArrowSquareOut;
  const url = blobUrl(item);
  const failed = item.metadata?.extraction_failed === true;
  const superseded = Boolean(item.superseded_by);
  const stage = typeof item.metadata?.stage === "string" ? item.metadata.stage : null;
  const uploader = item.uploaded_by === job.technician_id ? (job.technician_name ?? item.uploaded_by) : item.uploaded_by;
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = url && item.content_type?.startsWith("image/") && !imageBroken;

  return (
    <li
      className={cx(
        "flex flex-col rounded-panel border bg-surface p-4",
        failed ? "border-blocking-line" : "border-line",
        superseded && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated API bytes, not an optimizable asset
          <img
            src={url}
            alt={`${EVIDENCE_TYPE[item.type].label}: ${item.filename ?? item.id}`}
            onError={() => setImageBroken(true)}
            className="size-12 shrink-0 rounded-control border border-line object-cover"
          />
        ) : (
          <span className="grid size-12 shrink-0 place-items-center rounded-control border border-line bg-sunken text-ink-2">
            <Icon aria-hidden className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={cx("truncate text-sm font-semibold text-ink", superseded && "line-through")}>
            {item.filename ?? item.id}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-muted">
            <span>{EVIDENCE_TYPE[item.type]?.label ?? item.type}</span>
            {stage && <Badge tone="neutral">{stage === "before" ? "Before" : "After"}</Badge>}
            <span>
              {uploader}, {dateTime(item.created_at)}
            </span>
          </p>
        </div>
        {action}
      </div>

      {superseded && (
        <p className="mt-3 text-micro text-muted">
          Replaced by <span className="font-mono">{item.superseded_by}</span>. Conclusions drawn from it were recomputed.
        </p>
      )}

      {!superseded && failed && (
        <p className="mt-3 flex items-start gap-2 rounded-control bg-blocking-soft px-3 py-2 text-micro text-blocking-ink">
          <WarningOctagon aria-hidden weight="fill" className="mt-px size-3.5 shrink-0" />
          Could not be read, so it counts as nothing. FieldProof asks for a clearer copy.
        </p>
      )}

      {!superseded && !failed && item.processed_at === null && (
        <p className="mt-3 flex items-center gap-2 text-micro text-accent-ink">
          <HourglassMedium aria-hidden className="size-3.5" />
          Waiting to be read on the next verification run.
        </p>
      )}

      {!superseded && item.observations.length > 0 && !failed && (
        <ul className="mt-3 space-y-2 border-t border-line pt-3">
          {item.observations.map((o, i) => (
            <ObservationRow key={i} observation={o} />
          ))}
        </ul>
      )}

      {item.transcript && (
        <blockquote className="mt-3 rounded-control bg-sunken px-3 py-2 text-caption text-ink-2">
          &ldquo;{item.transcript}&rdquo;
        </blockquote>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="flex min-w-0 items-center gap-1 font-mono text-[0.6875rem] text-muted" title={item.sha256}>
          sha256 {shortHash(item.sha256, 12)}
          <CopyButton value={item.sha256} label="Copy content hash" className="size-6" />
        </span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-micro font-semibold text-accent-ink hover:underline"
          >
            Open file
            <ArrowSquareOut aria-hidden className="size-3.5" />
          </a>
        )}
      </div>
    </li>
  );
}

function ObservationRow({ observation }: { observation: Observation }) {
  const low = observation.confidence < CONFIDENCE_FLOOR;
  return (
    <li className="text-micro">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-ink-2">
          {observation.type.replaceAll("_", " ")}
          {observation.quantity != null && <span className="text-muted"> × {observation.quantity}</span>}
        </span>
        <span className={cx("font-mono tabular", low ? "font-semibold text-waiting-ink" : "text-muted")}>
          {percent(observation.confidence)}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div
          className={cx("h-full rounded-full", low ? "bg-waiting" : "bg-accent")}
          style={{ width: `${Math.max(observation.confidence * 100, 2)}%` }}
        />
      </div>
      {observation.detail && <p className="mt-1 text-muted">{observation.detail}</p>}
      {low && <p className="mt-0.5 text-waiting-ink">Below the 70% floor: cannot verify a requirement on its own.</p>}
    </li>
  );
}
