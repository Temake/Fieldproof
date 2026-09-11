"use client";

import { useEffect } from "react";
import { ArrowsClockwise, WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="grid min-h-[70dvh] place-items-center px-4 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-panel border border-blocking-line bg-blocking-soft text-blocking">
          <WarningOctagon aria-hidden weight="fill" className="size-6" />
        </div>
        <h1 className="mt-6 text-heading text-ink">Something went wrong</h1>
        <p className="mt-2 text-body text-muted">
          The page hit an unexpected error. Nothing was changed. Try again, and if it keeps happening check that the
          FieldProof API is running.
        </p>
        {error.digest && <p className="mt-2 font-mono text-micro text-faint">Reference {error.digest}</p>}
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={reset} icon={<ArrowsClockwise className="size-4" />}>
            Try again
          </Button>
          <ButtonLink href="/dashboard" variant="secondary">
            Operations
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
