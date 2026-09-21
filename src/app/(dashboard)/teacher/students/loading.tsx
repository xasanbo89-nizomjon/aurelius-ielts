import { PageHeaderSkeleton, TableSkeleton } from "@/components/dashboard/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <Skeleton className="h-28 w-full max-w-xs rounded-2xl" />
      <TableSkeleton columns={5} />
    </>
  );
}
