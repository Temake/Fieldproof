"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Fingerprint, Printer, SealCheck, SealWarning } from "@phosphor-icons/react/dist/ssr";
import { clientApi } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { ReceiptVerification } from "@/lib/types";
import { Button } from "./ui/button";

/** PRD 29 - ask the API to recompute the hash from the stored receipt. */
export function VerifyReceipt({ jobId }: { jobId: string }) {
  const [result, setResult] = useState<ReceiptVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function verify() {
    setChecking(true);
    setError(null);
    try {
      setResult(await clientApi.verifyReceipt(jobId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap gap-2">
        <Button onClick={verify} loading={checking} icon={<Fingerprint className="size-4" />}>
          Verify integrity
        </Button>
        <Button variant="secondary" onClick={() => window.print()} icon={<Printer className="size-4" />}>
          Print
        </Button>
      </div>
      <div aria-live="polite">
        <AnimatePresence mode="wait">
          {result && (
            <motion.p
              key={`${result.valid}-${result.sha256}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={
                result.valid
                  ? "flex items-start gap-2 text-caption font-medium text-verified-ink"
                  : "flex items-start gap-2 text-caption font-medium text-blocking-ink"
              }
            >
              {result.valid ? (
                <SealCheck aria-hidden weight="fill" className="mt-px size-4 shrink-0" />
              ) : (
                <SealWarning aria-hidden weight="fill" className="mt-px size-4 shrink-0" />
              )}
              {result.valid
                ? `Recomputed just now and it matches. ${result.sealed ? "This receipt is sealed and unaltered." : "This receipt is provisional until the job closes."}`
                : "The recomputed hash does not match. This receipt has been altered."}
            </motion.p>
          )}
          {error && (
            <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-caption text-blocking-ink">
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
