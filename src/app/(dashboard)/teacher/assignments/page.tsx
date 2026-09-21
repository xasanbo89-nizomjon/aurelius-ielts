import type { Metadata } from "next";
import { ListChecks } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";

export const metadata: Metadata = { title: "Assignments" };

const PAGE_SIZE = 10;

const STATUS_VARIANT = {
  ASSIGNED: "outline",
  IN_PROGRESS: "accent",
  SUBMITTED: "accent",
  COMPLETED: "success",
} as const;

export default async function TeacherAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const where = {
    teacherId: profile.id,
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [assignments, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { student: { include: { user: { select: { name: true } } } } },
    }),
    prisma.assignment.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/teacher/assignments?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Work you've assigned to individual students."
        actions={<SearchInput name="q" placeholder="Search assignments…" defaultValue={q} />}
      />

      {assignments.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={q ? "No matching assignments" : "No assignments yet"}
          description={
            q
              ? `No assignments found for "${q}". Try a different search.`
              : "Assign a test or task to a student and track its progress here."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium">{assignment.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {assignment.student.user.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {assignment.dueDate ? assignment.dueDate.toLocaleDateString() : "No due date"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[assignment.status]}>
                      {assignment.status.replace("_", " ").toLowerCase()}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </>
  );
}
