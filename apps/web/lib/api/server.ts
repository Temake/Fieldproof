import "server-only";

import type {
  DashboardCounts,
  Decision,
  DecisionDetail,
  DecisionStatus,
  Job,
  JobState,
  Metrics,
  Receipt,
  SentMessage,
  WorkflowRun,
} from "../types";
import { ApiError, toApiError } from "./errors";

/**
 * Server-side access to the FieldProof API (PRD 23).
 *
 * The API key lives only here. Server Components call the API directly; the
 * browser goes through app/api/[...path]/route.ts, which adds the same header.
 * Nothing secret is ever shipped to the client bundle.
 */

export const API_BASE_URL = (
  process.env.FIELDPROOF_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000"
).replace(/\/+$/, "");

export function authHeaders(): Record<string, string> {
  const key = process.env.FIELDPROOF_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: "application/json", ...authHeaders() },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "The FieldProof API is not reachable.");
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export const serverApi = {
  dashboard: () => get<DashboardCounts>("/api/dashboard"),
  jobs: () => get<Job[]>("/api/jobs"),
  job: (jobId: string) => get<JobState>(`/api/jobs/${enc(jobId)}`),
  metrics: (jobId: string) => get<Metrics>(`/api/jobs/${enc(jobId)}/metrics`),
  runs: (jobId: string) => get<WorkflowRun[]>(`/api/jobs/${enc(jobId)}/runs`),
  messages: (jobId: string) => get<SentMessage[]>(`/api/jobs/${enc(jobId)}/messages`),
  receipt: (jobId: string) => get<Receipt>(`/api/jobs/${enc(jobId)}/receipt`),
  decisions: (status: DecisionStatus = "PENDING") =>
    get<Decision[]>(`/api/decisions?status=${enc(status)}`),
  decision: (decisionId: string) => get<DecisionDetail>(`/api/decisions/${enc(decisionId)}`),
};

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Settle a request into data or an ApiError, so pages can render every state. */
export async function load<T>(request: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await request };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ApiError ? error : new ApiError(0, String(error)),
    };
  }
}
