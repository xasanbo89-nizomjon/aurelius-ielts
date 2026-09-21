import { PageHeaderSkeleton, TableSkeleton } from "@/components/dashboard/loading-skeletons";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <TableSkeleton columns={6} />
    </>
  );
}
