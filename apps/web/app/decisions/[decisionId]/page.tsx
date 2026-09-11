import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiUnavailable } from "@/components/ApiUnavailable";
import { DecisionCard } from "@/components/DecisionCard";
import { load, serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Decision" };

/** PRD 14 Screen 3. */
export default async function DecisionPage({ params }: { params: Promise<{ decisionId: string }> }) {
  const { decisionId } = await params;
  const result = await load(serverApi.decision(decisionId));
  if (!result.ok) {
    if (result.error.isNotFound) notFound();
    return <ApiUnavailable error={result.error} what="this decision" />;
  }
  return <DecisionCard detail={result.data} />;
}
