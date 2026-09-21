import { PageHeaderSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/dashboard/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatGridSkeleton items={4} />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <TableSkeleton rows={5} columns={6} />
    </>
  );
}
