import type { Metadata } from "next";
import Link from "next/link";
import { PenLine } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getDailyWritingActionLimit } from "@/lib/ai/writing";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import { WritingAiSettingsCard } from "@/components/teacher/writing-ai-settings-card";

export const metadata: Metadata = { title: "Writing Reviews" };

const PAGE_SIZE = 10;

export default async function TeacherWritingReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const where = {
    // A DRAFT is private, unsubmitted work — a teacher never sees it, exactly
    // like it never appears in the student's own submitted-report view either.
    status: { not: "DRAFT" as const },
    student: {
      teacherId: profile.id,
      ...(q ? { user: { name: { contains: q, mode: "insensitive" as const } } } : {}),
    },
  };

  const [submissions, total, dailyLimit] = await Promise.all([
    prisma.writingSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        student: { include: { user: { select: { name: true } } } },
        analysis: { select: { estimatedBand: true } },
      },
    }),
    prisma.writingSubmission.count({ where }),
    getDailyWritingActionLimit(profile.id),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/teacher/writing-reviews?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Writing Reviews"
        description="Task 1 and Task 2 submissions, with AI analysis and your own feedback."
        actions={<SearchInput name="q" placeholder="Search by student…" defaultValue={q} />}
      />

      <WritingAiSettingsCard dailyLimit={dailyLimit} />

      {submissions.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title={q ? "No matching submissions" : "No writing submissions yet"}
          description={
            q
              ? `No submissions found for "${q}". Try a different search.`
              : "Submissions from your students will show up here as soon as they submit a writing task."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>AI Band</TableHead>
                <TableHead>Teacher Band</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/teacher/writing-reviews/${submission.id}`}
                      className="hover:text-accent focus-visible:text-accent underline-offset-4 outline-none focus-visible:underline"
                    >
                      {submission.student.user.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{submission.taskType}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {submission.createdAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell>{submission.analysis?.estimatedBand.toFixed(1) ?? "—"}</TableCell>
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
