import { PageHeaderSkeleton, TableSkeleton } from "@/components/dashboard/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <TableSkeleton columns={6} />
    </>
  );
}
