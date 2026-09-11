import type { Metadata } from "next";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { CreateJobForm } from "@/components/CreateJobForm";

export const metadata: Metadata = { title: "New work order" };

/** PRD FR-01 - job intake. */
export default function NewJobPage() {
  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-caption text-muted">
        <Link href="/dashboard" className="hover:text-ink hover:underline">
          Operations
        </Link>
        <CaretRight aria-hidden className="size-3" />
        <span aria-current="page">New work order</span>
      </nav>
      <header>
        <h1 className="text-title text-ink">New work order</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">
          Define the scope, the money, and what must be proven. The technician gets a link to upload evidence; FieldProof
          does the rest.
        </p>
      </header>
      <CreateJobForm />
    </div>
  );
}
