import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/dashboard/loading-skeletons";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <CardGridSkeleton items={3} />
    </>
  );
}
