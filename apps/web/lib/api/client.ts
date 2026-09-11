/**
 * Browser-side API. Every call is same-origin (`/api/...`) and goes through
 * app/api/[...path]/route.ts, which attaches the API key on the server.
 */

import type {
  DashboardCounts,
  Decision,
  DecisionIn,
  DecisionStatus,
  Evidence,
  EvidenceType,
  Job,
  JobIn,
  JobState,
  Metadata,
  Metrics,
  ReceiptVerification,
  SentMessage,
  UploadUrl,
  WorkflowRun,
} from "../types";
import { ApiError, toApiError } from "./errors";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { Accept: "application/json", ...init.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Network error. Check your connection.");
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function postJson<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const enc = encodeURIComponent;

export interface UploadInput {
  file: File;
  type: EvidenceType;
  uploadedBy: string;
  stage?: "before" | "after" | null;
  metadata?: Metadata;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export const clientApi = {
  dashboard: () => request<DashboardCounts>("/api/dashboard"),
  jobs: () => request<Job[]>("/api/jobs"),
  job: (jobId: string) => request<JobState>(`/api/jobs/${enc(jobId)}`),
  metrics: (jobId: string) => request<Metrics>(`/api/jobs/${enc(jobId)}/metrics`),
  runs: (jobId: string) => request<WorkflowRun[]>(`/api/jobs/${enc(jobId)}/runs`),
  messages: (jobId: string) => request<SentMessage[]>(`/api/jobs/${enc(jobId)}/messages`),
  decisions: (status: DecisionStatus = "PENDING") =>
    request<Decision[]>(`/api/decisions?status=${enc(status)}`),
  verifyReceipt: (jobId: string) =>
    request<ReceiptVerification>(`/api/jobs/${enc(jobId)}/receipt/verify`),

  createJob: (payload: JobIn) => postJson<JobState>("/api/jobs", payload),
  completeJob: (jobId: string) =>
    postJson<{ job_id: string; status: string; accepted: boolean }>(
      `/api/jobs/${enc(jobId)}/complete`,
    ),
  retry: (jobId: string) =>
    postJson<{ job_id: string; accepted: boolean }>(`/api/jobs/${enc(jobId)}/retry`),
  resolveDecision: (decisionId: string, payload: DecisionIn) =>
    postJson<{ ok: boolean; duplicate: boolean; message: string }>(
      `/api/decisions/${enc(decisionId)}`,
      payload,
    ),

  /**
   * PRD 34 upload: ask for a signed URL, PUT the bytes straight to storage,
   * then confirm. The server hashes what it actually stored, never a value
   * the browser claims. In local mode the signed URL points at the API; it
   * is routed through the same-origin proxy so no CORS is involved.
   */
  async uploadEvidence(jobId: string, input: UploadInput): Promise<Evidence> {
    const contentType = input.file.type || null;
    const grant = await postJson<UploadUrl>(`/api/jobs/${enc(jobId)}/evidence/upload-url`, {
      filename: input.file.name,
      content_type: contentType,
    });

    await putBytes(sameOriginIfApi(grant.upload_url), input.file, grant.headers, input);

    return postJson<Evidence>(`/api/jobs/${enc(jobId)}/evidence/confirm`, {
      key: grant.key,
      type: input.type,
      filename: input.file.name,
      uploaded_by: input.uploadedBy,
      content_type: contentType,
      stage: input.stage ?? null,
      metadata: input.metadata ?? {},
    });
  },

  /** INV-009 - supersede an artifact; conclusions drawn from it are recomputed. */
  replaceEvidence(jobId: string, evidenceId: string, file: File, uploadedBy: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("uploaded_by", uploadedBy);
    return request<Evidence>(`/api/jobs/${enc(jobId)}/evidence/${enc(evidenceId)}/replace`, {
      method: "POST",
      body: form,
    });
  },
};

/** Evidence bytes are served by an authenticated endpoint (PRD 34). */
export function blobUrl(evidence: Pick<Evidence, "metadata" | "storage_url">): string | null {
  const key = evidence.metadata?.object_key;
  if (typeof key === "string" && key) {
    return `/api/evidence/blob/${key.split("/").map(enc).join("/")}`;
  }
  return evidence.storage_url.startsWith("/api/") ? evidence.storage_url : null;
}

function sameOriginIfApi(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.pathname.startsWith("/api/evidence/upload/")) return parsed.pathname;
  } catch {
    // Fall through to the URL as given.
  }
  return url;
}

function putBytes(
  url: string,
  file: File,
  headers: Record<string, string>,
  { onProgress, signal }: Pick<UploadInput, "onProgress" | "signal">,
): Promise<void> {
  // XHR rather than fetch: it reports upload progress.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText) as { detail?: string };
        if (body.detail) message = body.detail;
      } catch {
        // Keep the status message.
      }
      reject(new ApiError(xhr.status, message));
    };
    xhr.onerror = () => reject(new ApiError(0, "Upload failed. Check your connection."));
    xhr.onabort = () => reject(new ApiError(0, "Upload cancelled."));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
