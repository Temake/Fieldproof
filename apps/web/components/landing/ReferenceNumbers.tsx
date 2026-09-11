import { REFERENCE } from "@/lib/reference";
import { CountUp } from "../motion/count-up";
import { Reveal } from "../motion/reveal";

const NUMBERS = [
  { value: REFERENCE.metrics.workflowSteps, label: "workflow steps" },
  { value: REFERENCE.metrics.autonomous, label: "handled by FieldProof" },
  { value: REFERENCE.metrics.technicianRequests, label: "request to the technician" },
  { value: REFERENCE.metrics.supervisorDecisions, label: "supervisor decision" },
  { value: REFERENCE.metrics.manualReviews, label: "manual document reviews" },
];

/** PRD 38, from a real run of the reference job - not typed in. */
export function ReferenceNumbers() {
  return (
    <section aria-labelledby="numbers-title" className="mx-auto max-w-[1240px] px-4 py-24 sm:px-6 lg:py-32">
      <Reveal className="max-w-[44rem]">
        <h2 id="numbers-title" className="text-title text-ink">
          {REFERENCE.jobId}, start to finish.
        </h2>
        <p className="mt-5 max-w-[60ch] text-lead text-ink-2">
          The reference job in this repository, run end to end: a missing photo recovered, one scope question answered,
          $354.00 invoiced and the receipt sealed.
        </p>
      </Reveal>

      <dl className="mt-14 grid grid-cols-2 gap-y-10 border-t border-line pt-10 sm:grid-cols-3 lg:grid-cols-5">
        {NUMBERS.map((n, i) => (
          <Reveal key={n.label} delay={i * 0.06} className="flex flex-col-reverse pr-6 lg:border-l lg:border-line lg:pl-6 lg:first:border-l-0 lg:first:pl-0">
            <dt className="mt-2 text-caption text-muted">{n.label}</dt>
            <dd className="text-[clamp(2.75rem,2rem+2.4vw,4.25rem)] leading-none font-bold tracking-[-0.04em] text-ink [font-stretch:84%]">
              <CountUp value={n.value} className="tabular" />
            </dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}
