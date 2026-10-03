import { PageHeaderSkeleton, TableSkeleton } from "@/components/dashboard/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <Skeleton className="h-11 w-full max-w-sm rounded-xl" />
      <TableSkeleton columns={8} />
    </>
  );
}
