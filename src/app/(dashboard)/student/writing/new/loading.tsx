import { PageHeaderSkeleton } from "@/components/dashboard/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="max-w-2xl space-y-5">
        <Skeleton className="h-11 w-48 rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
        <Skeleton className="h-11 w-48 rounded-full" />
      </div>
    </>
  );
}
