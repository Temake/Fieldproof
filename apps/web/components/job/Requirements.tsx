import { CheckCircle, CircleDashed, CircleHalf, MinusCircle, XCircle } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import type { Requirement, RequirementStatus } from "@/lib/types";
import { REQUIREMENT_STATUS, REQUIREMENT_TYPE } from "@/lib/vocabulary";
import { TONE_TEXT } from "../ui/badge";

const ICON: Record<RequirementStatus, typeof CheckCircle> = {
  VERIFIED: CheckCircle,
  PARTIAL: CircleHalf,
  UNSUPPORTED: CircleDashed,
  CONTRADICTED: XCircle,
  NOT_REQUIRED: MinusCircle,
};

/** What must be true before the job can close (PRD 8.1), and whether it is. */
export function Requirements({ requirements }: { requirements: Requirement[] }) {
  if (requirements.length === 0) {
    return <p className="text-caption text-muted">This work order has no requirements, so there is nothing to verify.</p>;
  }
  const required = requirements.filter((r) => r.required);
  const verified = required.filter((r) => r.status === "VERIFIED").length;

  return (
    <div>
      <p className="mb-3 text-caption text-muted">
        <span className="font-semibold text-ink tabular">
          {verified}/{required.length}
        </span>{" "}
        required items verified
      </p>
      <ul className="space-y-3">
        {requirements.map((r) => {
          const term = REQUIREMENT_STATUS[r.status];
          const Icon = ICON[r.status];
          return (
            <li key={r.id} className="flex gap-3">
              <Icon aria-hidden weight="fill" className={cx("mt-0.5 size-[1.125rem] shrink-0", TONE_TEXT[term.tone])} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {r.description}
                  <span className="sr-only">: {term.label}</span>
                </p>
                <p className="mt-0.5 text-micro text-muted">
                  {REQUIREMENT_TYPE[r.type]?.label ?? r.type}
                  {r.part_number && (
                    <>
                      {" "}
                      · <span className="font-mono">{r.part_number}</span>
                    </>
                  )}
                  {r.expected_quantity != null && <> · {r.expected_quantity} authorized</>}
                  {!r.required && <> · optional</>}
                </p>
                {r.notes && <p className="mt-1 text-micro font-medium text-waiting-ink">{r.notes}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
