"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { ArrowRight, ListPlus, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { clientApi } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { cx } from "@/lib/cx";
import { money } from "@/lib/format";
import type { JobIn, RequirementType } from "@/lib/types";
import { REQUIREMENT_TYPE } from "@/lib/vocabulary";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Checkbox, Field, Input, Select } from "./ui/field";
import { Panel } from "./ui/panel";
import { useToast } from "./ui/toast";

interface RequirementDraft {
  key: string;
  type: RequirementType;
  description: string;
  required: boolean;
  expectedQuantity: string;
  partNumber: string;
}

const DEFAULT_DESCRIPTION: Record<RequirementType, string> = {
  photo_before: "Before photo of the work area",
  photo_after: "After photo showing the completed work",
  parts_receipt: "Parts receipt",
  customer_signature: "Customer signature",
  installation_quantity: "Install the authorized parts",
  task_completed: "Task completed",
  safety_form: "Completed safety form",
};

const STANDARD: RequirementType[] = ["photo_before", "photo_after", "parts_receipt", "customer_signature"];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

// Keys must match between server and client render, so they are derived from
// a per-form counter rather than a module-level one.
function draft(type: RequirementType, key: string): RequirementDraft {
  return {
    key,
    type,
    description: DEFAULT_DESCRIPTION[type],
    required: true,
    expectedQuantity: "",
    partNumber: "",
  };
}

type Errors = Record<string, string>;

export function CreateJobForm() {
  const router = useRouter();
  const toast = useToast();
  const formId = useId();

  const [jobId, setJobId] = useState("");
  const [description, setDescription] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [authorized, setAuthorized] = useState("");
  const [allowance, setAllowance] = useState("0");
  const [requirements, setRequirements] = useState<RequirementDraft[]>(() =>
    STANDARD.map((type, i) => draft(type, `req-${i}`)),
  );
  const nextKey = useRef(STANDARD.length);
  const newDraft = (type: RequirementType) => draft(type, `req-${nextKey.current++}`);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  function update(key: string, patch: Partial<RequirementDraft>) {
    setRequirements((current) =>
      current.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Keep the description in step with the type until someone edits it.
        if (patch.type && r.description === DEFAULT_DESCRIPTION[r.type]) {
          next.description = DEFAULT_DESCRIPTION[patch.type];
        }
        return next;
      }),
    );
  }

  function validate(): Errors {
    const e: Errors = {};
    if (jobId.trim() && !ID_PATTERN.test(jobId.trim())) e.jobId = "Use letters, numbers, dashes or underscores.";
    else if (jobId.trim().toLowerCase() === "new") e.jobId = "\"new\" is reserved. Choose another ID.";
    if (!description.trim()) e.description = "Describe the work so the technician and FieldProof know the scope.";
    if (!customerId.trim()) e.customerId = "Enter the customer ID.";
    if (!technicianId.trim()) e.technicianId = "Enter the technician ID. Evidence uploads are attributed to it.";
    const auth = Number(authorized);
    if (authorized.trim() === "" || Number.isNaN(auth) || auth < 0) e.authorized = "Enter an amount of 0 or more.";
    const allow = Number(allowance);
    if (allowance.trim() === "" || Number.isNaN(allow) || allow < 0) e.allowance = "Enter an amount of 0 or more.";
    for (const r of requirements) {
      if (!r.description.trim()) e[`${r.key}.description`] = "Describe this requirement.";
      if (r.type === "installation_quantity") {
        const qty = Number(r.expectedQuantity);
        if (!Number.isInteger(qty) || qty < 1) e[`${r.key}.qty`] = "Whole number, 1 or more.";
        if (!r.partNumber.trim()) e[`${r.key}.part`] = "Needed to match installed parts.";
      }
    }
    return e;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      document.getElementById(`${formId}-${first}`)?.focus();
      return;
    }

    const payload: JobIn = {
      ...(jobId.trim() ? { id: jobId.trim() } : {}),
      description: description.trim(),
      site_address: siteAddress.trim() || null,
      customer_id: customerId.trim(),
      technician_id: technicianId.trim(),
      technician_name: technicianName.trim() || null,
      authorized_amount: Number(authorized),
      max_additional_spend_without_approval: Number(allowance),
      requirements: requirements.map((r) => ({
        type: r.type,
        description: r.description.trim(),
        required: r.required,
        expected_quantity: r.type === "installation_quantity" ? Number(r.expectedQuantity) : null,
        part_number: r.type === "installation_quantity" ? r.partNumber.trim() : null,
      })),
    };

    setSubmitting(true);
    try {
      const state = await clientApi.createJob(payload);
      toast.push({
        tone: "success",
        title: `Work order ${state.job.id} created`,
        description: "Share the technician view so they can upload evidence.",
      });
      router.push(`/jobs/${state.job.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setErrors({ jobId: "A job with this ID already exists. Choose another or leave it blank." });
        document.getElementById(`${formId}-jobId`)?.focus();
      } else {
        setErrors({ form: errorMessage(error) });
      }
      setSubmitting(false);
    }
  }

  const id = (name: string) => `${formId}-${name}`;
  const allowanceValue = Number(allowance) || 0;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="space-y-6">
        <Panel aria-labelledby={id("scope")}>
          <h2 id={id("scope")} className="text-subheading text-ink">
            The work
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field id={id("description")} label="Description" error={errors.description} className="sm:col-span-2">
              {(c) => (
                <Input
                  {...c}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Replace 2 x Air Filter A - rooftop HVAC unit"
                />
              )}
            </Field>
            <Field id={id("siteAddress")} label="Site address" optional>
              {(c) => <Input {...c} value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} autoComplete="street-address" />}
            </Field>
            <Field id={id("jobId")} label="Job ID" optional error={errors.jobId} hint="Leave blank to generate one.">
              {(c) => <Input {...c} value={jobId} onChange={(e) => setJobId(e.target.value)} className="font-mono" spellCheck={false} />}
            </Field>
          </div>
        </Panel>

        <Panel aria-labelledby={id("people")}>
          <h2 id={id("people")} className="text-subheading text-ink">
            People
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <Field id={id("customerId")} label="Customer ID" error={errors.customerId}>
              {(c) => <Input {...c} value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="font-mono" spellCheck={false} />}
            </Field>
            <Field id={id("technicianId")} label="Technician ID" error={errors.technicianId}>
              {(c) => (
                <Input {...c} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className="font-mono" spellCheck={false} />
              )}
            </Field>
            <Field id={id("technicianName")} label="Technician name" optional hint="Used in messages to them.">
              {(c) => <Input {...c} value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} />}
            </Field>
          </div>
        </Panel>

        <Panel aria-labelledby={id("money")}>
          <h2 id={id("money")} className="text-subheading text-ink">
            Authorization
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field id={id("authorized")} label="Authorized amount (USD)" error={errors.authorized}>
              {(c) => (
                <Input {...c} type="number" inputMode="decimal" min={0} step="0.01" value={authorized} onChange={(e) => setAuthorized(e.target.value)} />
              )}
            </Field>
            <Field
              id={id("allowance")}
              label="Extra spend allowed without approval"
              error={errors.allowance}
              hint="Anything above this goes to a supervisor. Zero means every extra needs approval."
            >
              {(c) => (
                <Input {...c} type="number" inputMode="decimal" min={0} step="0.01" value={allowance} onChange={(e) => setAllowance(e.target.value)} />
              )}
            </Field>
          </div>
        </Panel>

        <Panel aria-labelledby={id("requirements")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id={id("requirements")} className="text-subheading text-ink">
                Requirements
              </h2>
              <p className="mt-0.5 text-caption text-muted">What must be proven before the job can close.</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={<ListPlus className="size-4" />}
                onClick={() =>
                  setRequirements((current) => [
                    ...current,
                    ...STANDARD.filter((t) => !current.some((r) => r.type === t)).map(newDraft),
                  ])
                }
              >
                Standard set
              </Button>
              <Button variant="secondary" size="sm" icon={<Plus weight="bold" className="size-4" />} onClick={() => setRequirements((c) => [...c, newDraft("installation_quantity")])}>
                Add requirement
              </Button>
            </div>
          </div>

          {requirements.length === 0 && (
            <Alert tone="warning" title="No requirements" className="mt-5">
              With nothing to verify, FieldProof closes the job as soon as the technician completes it.
            </Alert>
          )}

          <ul className="mt-5 space-y-3">
            <AnimatePresence initial={false}>
              {requirements.map((r, index) => (
                <motion.li
                  key={r.key}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <fieldset className="rounded-control border border-line bg-canvas/50 p-4">
                    <legend className="sr-only">Requirement {index + 1}</legend>
                    <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-start">
                      <Field id={id(`${r.key}.type`)} label={<>Type<span className="sr-only"> for requirement {index + 1}</span></>}>
                        {(c) => (
                          <Select {...c} value={r.type} onChange={(e) => update(r.key, { type: e.target.value as RequirementType })}>
                            {Object.entries(REQUIREMENT_TYPE).map(([value, meta]) => (
                              <option key={value} value={value}>
                                {meta.label}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      <Field
                        id={id(`${r.key}.description`)}
                        label={<>Description<span className="sr-only"> for requirement {index + 1}</span></>}
                        error={errors[`${r.key}.description`]}
                        hint={REQUIREMENT_TYPE[r.type].hint}
                      >
                        {(c) => <Input {...c} value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} />}
                      </Field>
                      <button
                        type="button"
                        onClick={() => setRequirements((c) => c.filter((x) => x.key !== r.key))}
                        aria-label={`Remove requirement ${index + 1}: ${r.description || REQUIREMENT_TYPE[r.type].label}`}
                        className="mt-7 grid size-10 place-items-center rounded-control text-muted transition-colors hover:bg-blocking-soft hover:text-blocking-ink"
                      >
                        <Trash aria-hidden className="size-4" />
                      </button>
                    </div>
                    {r.type === "installation_quantity" && (
                      <div className="mt-4 grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                        <Field
                          id={id(`${r.key}.qty`)}
                          label={<>Authorized quantity<span className="sr-only"> for requirement {index + 1}</span></>}
                          error={errors[`${r.key}.qty`]}
                        >
                          {(c) => (
                            <Input {...c} type="number" inputMode="numeric" min={1} step={1} value={r.expectedQuantity} onChange={(e) => update(r.key, { expectedQuantity: e.target.value })} />
                          )}
                        </Field>
                        <Field
                          id={id(`${r.key}.part`)}
                          label={<>Part number<span className="sr-only"> for requirement {index + 1}</span></>}
                          error={errors[`${r.key}.part`]}
                        >
                          {(c) => (
                            <Input {...c} value={r.partNumber} onChange={(e) => update(r.key, { partNumber: e.target.value })} className="font-mono" spellCheck={false} placeholder="HVAC-FILTER-A" />
                          )}
                        </Field>
                      </div>
                    )}
                    <Checkbox
                      className="mt-4"
                      label="Required to close"
                      checked={r.required}
                      onChange={(e) => update(r.key, { required: e.target.checked })}
                    />
                  </fieldset>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Panel>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24">
        <Panel>
          <h2 className="text-subheading text-ink">What FieldProof will check</h2>
          <ul className="mt-4 space-y-2">
            {requirements.filter((r) => r.required).map((r) => (
              <li key={r.key} className="flex gap-2 text-caption text-ink-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>
                  {r.description || REQUIREMENT_TYPE[r.type].label}
                  {r.type === "installation_quantity" && r.expectedQuantity && (
                    <span className="text-muted">
                      {" "}
                      ({r.expectedQuantity} × <span className="font-mono">{r.partNumber || "part"}</span>)
                    </span>
                  )}
                </span>
              </li>
            ))}
            {requirements.every((r) => !r.required) && <li className="text-caption text-muted">Nothing is required yet.</li>}
          </ul>
          <p className={cx("mt-5 border-t border-line pt-4 text-caption text-ink-2")}>
            {allowanceValue > 0 ? (
              <>
                Extra spend up to <span className="font-semibold">{money(allowanceValue)}</span> is approved automatically.
                More than that becomes one question for a supervisor.
              </>
            ) : (
              <>Any spend beyond the authorized amount becomes one question for a supervisor.</>
            )}
          </p>
        </Panel>

        {errors.form && (
          <Alert tone="danger" title="The work order was not created">
            {errors.form}
          </Alert>
        )}

        <Button type="submit" size="lg" loading={submitting} className="w-full" iconRight={<ArrowRight weight="bold" className="size-4" />}>
          Create work order
        </Button>
      </aside>
    </form>
  );
}
