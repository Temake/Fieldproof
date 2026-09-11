import { Skeleton } from "@/components/ui/feedback";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6" aria-busy="true" aria-label="Loading job">
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-24 rounded-panel" />
      <Skeleton className="h-80 rounded-panel" />
    </div>
  );
}
