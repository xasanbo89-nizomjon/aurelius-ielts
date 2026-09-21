import type { Metadata } from "next";
import { Mic } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";

export const metadata: Metadata = { title: "Speaking Reviews" };

const PAGE_SIZE = 10;

export default async function TeacherSpeakingReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const where = {
    student: {
      teacherId: profile.id,
      ...(q ? { user: { name: { contains: q, mode: "insensitive" as const } } } : {}),
    },
  };

  const [submissions, total] = await Promise.all([
    prisma.speakingSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { student: { include: { user: { select: { name: true } } } } },
    }),
    prisma.speakingSubmission.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/teacher/speaking-reviews?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Speaking Reviews"
        description="Recorded responses awaiting your feedback."
        actions={<SearchInput name="q" placeholder="Search by student…" defaultValue={q} />}
      />

      {submissions.length === 0 ? (
        <EmptyState
          icon={Mic}
          title={q ? "No matching submissions" : "No speaking submissions yet"}
          description={
            q
              ? `No submissions found for "${q}". Try a different search.`
              : "Recordings from your students will show up here as soon as they submit a speaking response."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Part</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Band score</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-medium">{submission.student.user.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">Part {submission.part}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {submission.createdAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell>{submission.bandScore?.toFixed(1) ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={submission.status === "REVIEWED" ? "success" : "outline"}>
                      {submission.status.replace("_", " ").toLowerCase()}
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
