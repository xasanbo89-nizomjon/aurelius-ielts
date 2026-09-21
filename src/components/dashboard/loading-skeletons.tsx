import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2.5">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
    </div>
  );
}

export function StatGridSkeleton({ items = 4 }: { items?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: items }).map((_, i) => (
        <Card key={i} className="gap-0 py-5">
          <CardContent className="flex items-start justify-between gap-4">
            <div className="w-full space-y-2.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="size-10 shrink-0 rounded-xl" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ items = 6 }: { items?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: items }).map((_, i) => (
        <Card key={i} className="gap-5 py-6">
          <CardHeader>
            <Skeleton className="size-11 rounded-xl" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SkillPracticeLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <CardGridSkeleton items={3} />
    </>
  );
}

export function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="border-border/70 overflow-hidden rounded-2xl border">
      <div className="bg-secondary/60 flex gap-4 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-border/70 divide-y">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: columns }).map((_, col) => (
              <Skeleton key={col} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableLoading({ columns = 4 }: { columns?: number }) {
  return (
    <>
      <PageHeaderSkeleton />
      <TableSkeleton columns={columns} />
    </>
  );
}
