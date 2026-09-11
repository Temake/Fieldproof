"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, useRef, useState, type DragEvent } from "react";
import { CloudArrowUp, File as FileIcon, X } from "@phosphor-icons/react/dist/ssr";
import { clientApi } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { cx } from "@/lib/cx";
import { bytes } from "@/lib/format";
import type { Evidence, EvidenceType, Metadata } from "@/lib/types";
import { EVIDENCE_TYPE } from "@/lib/vocabulary";
import { EVIDENCE_ICON } from "../job/evidence-icon";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Field, Textarea } from "../ui/field";

const ORDER: EvidenceType[] = ["image", "receipt", "signature", "voice_note", "pdf", "checklist", "video", "sensor_reading"];

const ACCEPT: Record<EvidenceType, string> = {
  image: "image/*",
  video: "video/*",
  receipt: "image/*,application/pdf",
  signature: "image/*",
  pdf: "application/pdf",
  sensor_reading: "application/json,.json",
  voice_note: "audio/*,text/plain,.txt",
  checklist: "application/pdf,image/*,text/plain,.txt",
};

const HINT: Partial<Record<EvidenceType, string>> = {
  image: "Tag it before or after so it counts for the right requirement.",
  receipt: "A receipt proves what was bought. A photo proves what was installed.",
  voice_note: "Audio is transcribed. A .txt file is used as its own transcript.",
  sensor_reading: "A JSON payload with an observations list.",
};

interface UploadEvidenceProps {
  jobId: string;
  uploadedBy: string;
  onUploaded: (evidence: Evidence) => void;
  /** Pre-select a type, e.g. when answering a request for a photo. */
  suggestedType?: EvidenceType;
}

export function UploadEvidence({ jobId, uploadedBy, onUploaded, suggestedType = "image" }: UploadEvidenceProps) {
  const formId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<EvidenceType>(suggestedType);
  const [stage, setStage] = useState<"before" | "after" | null>("after");
  const [file, setFile] = useState<File | null>(null);
  const [metadataText, setMetadataText] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const staged = type === "image" || type === "video";

  function pick(next: File | null) {
    setFile(next);
    setError(null);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) pick(dropped);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMetadataError(null);
    if (!file) {
      setError("Choose a file first.");
      inputRef.current?.focus();
      return;
    }
    if (file.size === 0) {
      setError("That file is empty.");
      return;
    }
    let metadata: Metadata = {};
    if (metadataText.trim()) {
      try {
        const parsed: unknown = JSON.parse(metadataText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        metadata = parsed as Metadata;
      } catch {
        setMetadataError("Metadata must be a JSON object, for example {\"note\": \"third bay\"}.");
        return;
      }
    }

    setProgress(0);
    try {
      const evidence = await clientApi.uploadEvidence(jobId, {
        file,
        type,
        uploadedBy,
        stage: staged ? stage : null,
        metadata,
        onProgress: setProgress,
      });
      onUploaded(evidence);
      setFile(null);
      setMetadataText("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }

  const uploading = progress !== null;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">What is it?</legend>
        <div role="radiogroup" className="mt-2 grid grid-cols-4 gap-2">
          {ORDER.map((t) => {
            const Icon = EVIDENCE_ICON[t];
            const selected = type === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setType(t)}
                className={cx(
                  "relative flex flex-col items-center gap-1.5 rounded-control border px-1 py-3 text-[0.6875rem] font-semibold transition-colors sm:text-micro",
                  selected ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                )}
              >
                <Icon aria-hidden className="size-5" weight={selected ? "fill" : "regular"} />
                {EVIDENCE_TYPE[t].short}
              </button>
            );
          })}
        </div>
        {HINT[type] && <p className="mt-2 text-micro text-muted">{HINT[type]}</p>}
      </fieldset>

      <AnimatePresence initial={false}>
        {staged && (
          <motion.fieldset
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <legend className="text-sm font-semibold text-ink">Taken</legend>
            <div role="radiogroup" className="mt-2 grid grid-cols-2 gap-2">
              {(["before", "after"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={stage === s}
                  onClick={() => setStage(s)}
                  className={cx(
                    "h-11 rounded-control border text-sm font-semibold transition-colors",
                    stage === s ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                  )}
                >
                  {s === "before" ? "Before the work" : "After the work"}
                </button>
              ))}
            </div>
          </motion.fieldset>
        )}
      </AnimatePresence>

      <div>
        <label
          htmlFor={`${formId}-file`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-panel border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-canvas/60 hover:border-accent hover:bg-accent-soft/40",
            error && !file && "border-blocking",
          )}
        >
          <CloudArrowUp aria-hidden className={cx("size-8", dragging ? "text-accent" : "text-muted")} />
          <span className="text-sm font-semibold text-ink">
            {type === "image" ? "Take a photo or choose a file" : "Choose a file"}
          </span>
          <span className="text-micro text-muted">or drop it here</span>
        </label>
        <input
          ref={inputRef}
          id={`${formId}-file`}
          type="file"
          accept={ACCEPT[type]}
          capture={type === "image" ? "environment" : undefined}
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        <AnimatePresence>
          {file && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-center gap-3 rounded-control border border-line bg-surface px-3 py-2"
            >
              <FileIcon aria-hidden className="size-5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                <p className="text-micro text-muted">{bytes(file.size)}</p>
              </div>
              {!uploading && (
                <button
                  type="button"
                  onClick={() => {
                    pick(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  aria-label={`Remove ${file.name}`}
                  className="grid size-8 place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink"
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <details className="group rounded-control border border-line bg-surface px-3 py-2 text-caption">
        <summary className="cursor-pointer font-semibold text-ink-2 select-none">Add metadata (advanced)</summary>
        <div className="mt-3 pb-1">
          <Field
            id={`${formId}-metadata`}
            label="Metadata"
            optional
            error={metadataError}
            hint="A JSON object stored with the artifact. In offline mode, a fixture_reading key declares what the stub reader sees."
          >
            {(c) => (
              <Textarea {...c} rows={3} value={metadataText} onChange={(e) => setMetadataText(e.target.value)} className="font-mono text-micro" spellCheck={false} />
            )}
          </Field>
        </div>
      </details>

      {error && (
        <Alert tone="danger" title="Upload failed">
          {error}
        </Alert>
      )}

      <div className="space-y-2">
        <Button type="submit" size="lg" className="w-full" loading={uploading} icon={<CloudArrowUp className="size-5" />}>
          {uploading ? `Uploading ${Math.round((progress ?? 0) * 100)}%` : "Upload"}
        </Button>
        {uploading && (
          <div className="h-1 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)} aria-label="Upload progress">
            <motion.div className="h-full bg-accent" initial={{ width: 0 }} animate={{ width: `${(progress ?? 0) * 100}%` }} />
          </div>
        )}
      </div>
    </form>
  );
}
