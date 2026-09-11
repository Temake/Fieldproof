"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import {
  ArrowsClockwise,
  ChatCircleText,
  CheckCircle,
  Circle,
  FlagCheckered,
  Gavel,
  MapPin,
  SealCheck,
} from "@phosphor-icons/react/dist/ssr";
import { clientApi } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { cx } from "@/lib/cx";
import type { Evidence, EvidenceType, JobState, Requirement } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { ACTIVE_STATUSES, REQUIREMENT_TYPE } from "@/lib/vocabulary";
import { StatusPill } from "../StatusPill";
import { EvidenceList } from "../job/EvidenceList";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Logo } from "../ui/logo";
import { Panel } from "../ui/panel";
import { useToast } from "../ui/toast";
import { UploadEvidence } from "./UploadEvidence";

/**
 * Which artifact satisfies each requirement, mirroring the reconciliation
 * engine's ARTIFACT_REQUIREMENTS. Used only to show the technician what they
 * have already uploaded; FieldProof still does the verifying.
 */
function hasArtifactFor(requirement: Requirement, evidence: Evidence[]): boolean {
  const is = (type: EvidenceType, stage?: string) =>
    evidence.some((e) => e.type === type && (!stage || e.metadata?.stage === undefined || e.metadata?.stage === stage));
  switch (requirement.type) {
    case "photo_before":
      return is("image", "before");
    case "photo_after":
    case "installation_quantity":
      return is("image", "after") || is("video", "after");
    case "parts_receipt":
      return is("receipt");
    case "customer_signature":
      return is("signature");
    case "safety_form":
      return is("pdf");
    case "task_completed":
      return is("image") || is("checklist") || is("video");
  }
}

function suggestedTypeFor(requirement: Requirement | undefined): EvidenceType {
  switch (requirement?.type) {
    case "parts_receipt":
      return "receipt";
    case "customer_signature":
      return "signature";
    case "safety_form":
      return "pdf";
    default:
      return "image";
  }
}

export function FieldJob({ initial }: { initial: JobState }) {
  const toast = useToast();
  const jobId = initial.job.id;
  const poll = usePoll(() => clientApi.job(jobId), initial, {
    interval: (s) => (ACTIVE_STATUSES.has(s.job.status) ? 1500 : s.job.status === "CLOSED" ? null : 4000),
  });
  const state = poll.data;
  const { job } = state;
  const name = job.technician_name ?? job.technician_id;
  const evidence = state.evidence.filter((e) => !e.superseded_by);
  const onSite = job.status === "OPEN" || job.status === "IN_PROGRESS";
  const closed = job.status === "CLOSED";

  const [confirmComplete, setConfirmComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<Evidence | null>(null);
  const uploadRef = useRef<HTMLDivElement>(null);

  const request = [...state.events].reverse().find((e) => e.type === "EVIDENCE_REQUESTED");
  const requestText = (request?.payload.result as { message?: string } | undefined)?.message ?? request?.message ?? null;
  const requestedIds = (request?.payload.result as { requirement_ids?: string[] } | undefined)?.requirement_ids ?? [];
  const requested = state.requirements.find((r) => requestedIds.includes(r.id));

  const required = state.requirements.filter((r) => r.required);
  const missingBeforeComplete = required.filter((r) => !hasArtifactFor(r, evidence));

  async function complete() {
    setCompleting(true);
    setCompleteError(null);
    try {
      await clientApi.completeJob(jobId);
      setConfirmComplete(false);
      toast.push({ tone: "success", title: "Job completed", description: "FieldProof is verifying. You can leave the site." });
      await poll.refresh();
    } catch (error) {
      setCompleteError(errorMessage(error));
    } finally {
      setCompleting(false);
    }
  }

  function onUploaded(item: Evidence) {
    toast.push({
      tone: "success",
      title: "Uploaded",
      description: onSite ? `${item.filename ?? "Artifact"} is attached to the job.` : "FieldProof picks it up right away.",
    });
    void poll.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-32 sm:px-6">
      <header className="flex h-16 items-center justify-between">
        <Logo compact href="/" />
        <span className="font-mono text-caption font-semibold text-ink-2">{job.id}</span>
      </header>

      <main id="main" className="flex-1 space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          aria-labelledby="field-title"
          className="pt-2"
        >
          <p className="text-caption text-muted">Hi {name}</p>
          <h1 id="field-title" className="mt-1 text-[1.75rem] leading-tight font-bold tracking-[-0.025em] text-ink [font-stretch:90%]">
            {job.description || "Your job"}
          </h1>
          {job.site_address && (
            <p className="mt-2 flex items-center gap-1.5 text-caption text-ink-2">
              <MapPin aria-hidden className="size-4 text-muted" />
              {job.site_address}
            </p>
          )}
        </motion.section>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={job.status} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <StatusCard state={state} requestText={requestText} onJump={() => uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
          </motion.div>
        </AnimatePresence>

        {required.length > 0 && (
          <Panel aria-labelledby="checklist-heading" className="p-5">
            <h2 id="checklist-heading" className="text-subheading text-ink">
              {onSite ? "What to capture" : "What FieldProof checked"}
            </h2>
            <ul className="mt-4 space-y-3">
              {required.map((r) => {
                const uploaded = hasArtifactFor(r, evidence);
                const verified = !onSite && r.status === "VERIFIED";
                const done = onSite ? uploaded : verified;
                return (
                  <li key={r.id} className="flex items-start gap-3">
                    {done ? (
                      <CheckCircle aria-hidden weight="fill" className={cx("mt-px size-5 shrink-0", onSite ? "text-accent" : "text-verified")} />
                    ) : (
                      <Circle aria-hidden className="mt-px size-5 shrink-0 text-faint" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{r.description}</p>
                      <p className="text-micro text-muted">
                        {onSite
                          ? uploaded
                            ? "Uploaded"
                            : REQUIREMENT_TYPE[r.type].hint
                          : r.notes ?? (verified ? "Verified" : "Not verified yet")}
                      </p>
                    </div>
                    {!onSite && <StatusPill kind="requirement" status={r.status} />}
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        {!closed && (
          <div ref={uploadRef} className="scroll-mt-4">
            <Panel aria-labelledby="upload-heading" className="p-5">
              <h2 id="upload-heading" className="text-subheading text-ink">
                Upload evidence
              </h2>
              <p className="mt-0.5 mb-5 text-caption text-muted">Photos, receipts, signatures, voice notes, documents.</p>
              <UploadEvidence
                key={requested?.id ?? "default"}
                jobId={job.id}
                uploadedBy={job.technician_id}
                onUploaded={onUploaded}
                suggestedType={suggestedTypeFor(requested)}
              />
            </Panel>
          </div>
        )}

        <section aria-labelledby="uploaded-heading">
          <h2 id="uploaded-heading" className="mb-3 text-subheading text-ink">
            Uploaded <span className="font-normal text-muted tabular">({evidence.length})</span>
          </h2>
          {state.evidence.length === 0 ? (
            <p className="rounded-panel border border-dashed border-line-strong px-4 py-8 text-center text-caption text-muted">
              Nothing yet. Everything you upload shows up here.
            </p>
          ) : (
            <EvidenceList
              evidence={state.evidence}
              job={job}
              compact
              action={(item) =>
                !closed && !item.superseded_by ? (
                  <Button variant="ghost" size="sm" onClick={() => setReplacing(item)} icon={<ArrowsClockwise className="size-4" />}>
                    Replace
                  </Button>
                ) : null
              }
            />
          )}
        </section>
      </main>

      {onSite && (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <p className="hidden flex-1 text-caption text-muted sm:block">
              {missingBeforeComplete.length === 0
                ? "Everything on the list is uploaded."
                : `${missingBeforeComplete.length} item${missingBeforeComplete.length === 1 ? "" : "s"} not uploaded yet.`}
            </p>
            <Button size="lg" className="w-full sm:w-auto" onClick={() => setConfirmComplete(true)} icon={<FlagCheckered className="size-5" />}>
              Complete job
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        title="Complete this job?"
        description="FieldProof takes it from here. If anything is missing it will message you, so you can leave the site."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmComplete(false)}>
              Not yet
            </Button>
            <Button onClick={complete} loading={completing} icon={<FlagCheckered className="size-4" />}>
              Complete job
            </Button>
          </>
        }
      >
        {missingBeforeComplete.length > 0 && (
          <Alert tone="warning" title="Some items are not uploaded">
            <ul className="mt-1 list-disc pl-4">
              {missingBeforeComplete.map((r) => (
                <li key={r.id}>{r.description}</li>
              ))}
            </ul>
            <p className="mt-2">You can still complete; FieldProof will ask you for them.</p>
          </Alert>
        )}
        {completeError && (
          <Alert tone="danger" title="The job was not completed" className="mt-3">
            {completeError}
          </Alert>
        )}
      </Dialog>

      <ReplaceDialog
        jobId={job.id}
        uploadedBy={job.technician_id}
        item={replacing}
        onClose={() => setReplacing(null)}
        onReplaced={() => {
          setReplacing(null);
          toast.push({ tone: "success", title: "Replaced", description: "Conclusions from the old file are recomputed." });
          void poll.refresh();
        }}
      />
    </div>
  );
}

function StatusCard({ state, requestText, onJump }: { state: JobState; requestText: string | null; onJump: () => void }) {
  const { job } = state;
  const status = job.status;

  if (status === "WAITING_FOR_EVIDENCE") {
    return (
      <div className="rounded-panel border border-waiting-line bg-waiting-soft p-5">
        <div className="flex items-start gap-3">
          <ChatCircleText aria-hidden weight="fill" className="mt-0.5 size-6 shrink-0 text-waiting" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">FieldProof needs one more thing</p>
            {requestText && <p className="mt-1.5 text-body text-ink-2">&ldquo;{requestText}&rdquo;</p>}
            <Button className="mt-4" size="sm" onClick={onJump}>
              Upload it now
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (status === "OPEN" || status === "IN_PROGRESS") {
    return (
      <Alert tone="info" title="Upload what you have, then complete the job">
        FieldProof checks everything against the work order after you finish. You will not need to fill in paperwork.
      </Alert>
    );
  }
  if (status === "WAITING_FOR_DECISION") {
    return (
      <div className="flex items-start gap-3 rounded-panel border border-line bg-surface p-5">
        <Gavel aria-hidden className="mt-0.5 size-6 shrink-0 text-muted" />
        <div>
          <p className="text-sm font-semibold text-ink">A supervisor is reviewing one item</p>
          <p className="mt-1 text-caption text-muted">Nothing is needed from you. You will be messaged if that changes.</p>
        </div>
      </div>
    );
  }
  if (status === "CLOSED") {
    return (
      <Alert tone="success" title="Job closed">
        Everything checked out and the receipt is sealed. Thank you.
      </Alert>
    );
  }
  if (status === "FAILED") {
    return (
      <Alert tone="warning" title="Verification paused">
        Nothing is needed from you. The office has been notified and it will resume automatically.
      </Alert>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-panel border border-accent-line bg-accent-soft p-5">
      <span aria-hidden className="mt-2 ml-1 live-dot text-accent" />
      <div>
        <p className="text-sm font-semibold text-ink">FieldProof is checking your evidence</p>
        <p className="mt-1 text-caption text-ink-2">You can leave the site. If anything is missing, you will be asked here.</p>
      </div>
      <SealCheck aria-hidden className="ml-auto size-6 shrink-0 text-accent" />
    </div>
  );
}

function ReplaceDialog({
  jobId,
  uploadedBy,
  item,
  onClose,
  onReplaced,
}: {
  jobId: string;
  uploadedBy: string;
  item: Evidence | null;
  onClose: () => void;
  onReplaced: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function replace() {
    if (!item || !file) {
      setError("Choose the new file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await clientApi.replaceEvidence(jobId, item.id, file, uploadedBy);
      setFile(null);
      onReplaced();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={item !== null}
      onClose={() => {
        setFile(null);
        setError(null);
        onClose();
      }}
      title={`Replace ${item?.filename ?? "artifact"}`}
      description="The old file stays in the record as replaced, and anything FieldProof concluded from it is recomputed."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={replace} loading={busy} icon={<ArrowsClockwise className="size-4" />}>
            Replace
          </Button>
        </>
      }
    >
      <label className="block text-sm font-semibold text-ink" htmlFor="replace-file">
        New file
      </label>
      <input
        id="replace-file"
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="mt-2 block w-full rounded-control border border-line bg-surface text-sm text-ink-2 file:mr-3 file:h-10 file:border-0 file:border-r file:border-line file:bg-sunken file:px-4 file:text-sm file:font-semibold file:text-ink"
      />
      {error && <p className="mt-2 text-micro font-medium text-blocking-ink">{error}</p>}
    </Dialog>
  );
}
