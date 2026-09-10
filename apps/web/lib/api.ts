import type {
  DashboardCounts,
  DecisionDetail,
  Job,
  JobEvent,
  JobState,
  Metrics,
  Receipt,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function get<T>(path: string, revalidate = 0): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate }, cache: "no-store" });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  dashboard: () => get<DashboardCounts>("/api/dashboard"),
  jobs: () => get<Job[]>("/api/jobs"),
  job: (jobId: string) => get<JobState>(`/api/jobs/${jobId}`),
  timeline: (jobId: string) => get<JobEvent[]>(`/api/jobs/${jobId}/events`),
  metrics: (jobId: string) => get<Metrics>(`/api/jobs/${jobId}/metrics`),
  receipt: (jobId: string) => get<Receipt>(`/api/jobs/${jobId}/receipt`),
  decision: (decisionId: string) => get<DecisionDetail>(`/api/decisions/${decisionId}`),

  async resolve(decisionId: string, decision: string, decidedBy = "supervisor") {
    const res = await fetch(`${BASE}/api/decisions/${decisionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, decided_by: decidedBy }),
    });
    if (!res.ok) throw new Error(`resolve failed: ${res.status}`);
    return res.json();
  },
};

export const money = (n: number | null | undefined) =>
  n == null ? "-" : n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
