import { PageHeaderSkeleton, StatGridSkeleton, CardGridSkeleton } from "@/components/dashboard/loading-skeletons";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatGridSkeleton items={3} />
      <CardGridSkeleton items={2} />
    </>
  );
}
