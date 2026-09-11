import { Skeleton } from "./ui/feedback";

/** Loading shapes that match the pages they stand in for, so nothing jumps. */

export function DashboardSkeleton() {
  return (
    <div className="space-y-10" aria-busy="true" aria-label="Loading operations">
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-panel" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-96 rounded-panel" />
      </div>
    </div>
  );
}

export function JobSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading job">
      <Skeleton className="h-4 w-40" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-[28rem] max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-20 rounded-panel" />
      <Skeleton className="h-32 rounded-panel" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[32rem] rounded-panel" />
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-panel" />
          <Skeleton className="h-48 rounded-panel" />
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-panel" />
        ))}
      </div>
    </div>
  );
}

export function DocumentSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-[40rem] rounded-panel" />
    </div>
  );
}
