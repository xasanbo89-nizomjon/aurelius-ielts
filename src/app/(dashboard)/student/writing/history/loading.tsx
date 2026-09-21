import { PageHeaderSkeleton, TableSkeleton } from "@/components/dashboard/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <Skeleton className="h-8 w-40" />
      <PageHeaderSkeleton />
      <TableSkeleton columns={6} />
    </>
  );
}
