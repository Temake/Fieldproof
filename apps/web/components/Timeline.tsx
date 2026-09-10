import type { JobEvent } from "@/lib/types";
import { time } from "@/lib/api";

/**
 * PRD 14 Screen 2. The timeline is the product's proof of autonomy, so every
 * line says who acted: FieldProof, the technician, or a named supervisor.
 */
const HUMAN = new Set(["DECISION_RESOLVED", "EVIDENCE_UPLOADED", "JOB_COMPLETED"]);

export function Timeline({ events }: { events: JobEvent[] }) {
  const visible = events.filter((e) => e.message);
  return (
    <ol className="space-y-0">
      {visible.map((event, i) => {
        const human = HUMAN.has(event.type);
        return (
          <li key={event.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={`mt-1.5 size-2 rounded-full ${
                  human ? "bg-slate-400" : "bg-[var(--color-agent)]"
                }`}
              />
              {i < visible.length - 1 && (
                <span className="w-px flex-1 bg-[var(--color-line)]" />
              )}
            </div>
            <div className="pb-4">
              <p className="text-sm">{event.message}</p>
              <p className="text-xs text-[var(--color-muted)]">
                {time(event.created_at)} · {human ? event.actor : "FieldProof"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
