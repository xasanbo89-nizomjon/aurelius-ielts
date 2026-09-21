import { CardGridSkeleton, PageHeaderSkeleton, StatGridSkeleton } from "@/components/dashboard/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatGridSkeleton items={3} />
      <CardGridSkeleton items={2} />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </>
  );
}
