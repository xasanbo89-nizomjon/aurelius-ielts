import { PageHeaderSkeleton, StatGridSkeleton } from "@/components/dashboard/loading-skeletons";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatGridSkeleton items={5} />
    </>
  );
}
