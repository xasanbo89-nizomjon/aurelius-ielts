import { CardGridSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/dashboard/loading-skeletons";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <CardGridSkeleton items={3} />
      <TableSkeleton rows={8} columns={3} />
    </>
  );
}
