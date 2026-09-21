import { PageHeaderSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/dashboard/loading-skeletons";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatGridSkeleton items={4} />
      <TableSkeleton columns={6} />
    </>
  );
}
