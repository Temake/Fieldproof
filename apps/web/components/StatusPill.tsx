const TONE: Record<string, string> = {
  VERIFIED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CLOSED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PARTIAL: "bg-amber-50 text-amber-700 ring-amber-200",
  WAITING_FOR_EVIDENCE: "bg-amber-50 text-amber-700 ring-amber-200",
  WAITING_FOR_DECISION: "bg-blue-50 text-blue-700 ring-blue-200",
  VERIFYING: "bg-blue-50 text-blue-700 ring-blue-200",
  UNSUPPORTED: "bg-red-50 text-red-700 ring-red-200",
  CONTRADICTED: "bg-red-50 text-red-700 ring-red-200",
  BLOCKING: "bg-red-50 text-red-700 ring-red-200",
  WARNING: "bg-amber-50 text-amber-700 ring-amber-200",
  INFO: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function StatusPill({ status }: { status: string }) {
  const tone = TONE[status] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {status.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}
