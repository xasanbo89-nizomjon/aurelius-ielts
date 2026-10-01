import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/dashboard/loading-skeletons";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <CardGridSkeleton items={4} />
    </>
  );
}
