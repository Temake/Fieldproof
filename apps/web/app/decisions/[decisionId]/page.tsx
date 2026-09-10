import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { DecisionCard } from "@/components/DecisionCard";

export const dynamic = "force-dynamic";

/** PRD 14 Screen 3. */
export default async function DecisionPage({
  params,
}: {
  params: Promise<{ decisionId: string }>;
}) {
  const { decisionId } = await params;
  const detail = await api.decision(decisionId).catch(() => null);
  if (!detail) notFound();
  return <DecisionCard detail={detail} />;
}
