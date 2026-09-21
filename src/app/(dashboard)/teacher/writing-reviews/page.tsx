import type { Metadata } from "next";
import Link from "next/link";
import { Clock, PenLine, TrendingUp, Users } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getDailyWritingActionLimit } from "@/lib/ai/writing";
import { getSubmissionStatusCounts, getStudentWritingProgress } from "@/lib/teacher-writing-analytics";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const [submissions, total, dailyLimit, statusCounts, studentProgress] = await Promise.all([
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
    getSubmissionStatusCounts(profile.id),
    getStudentWritingProgress(profile.id),
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Pending Submissions"
          value={String(statusCounts.pending)}
          icon={Clock}
          caption={statusCounts.pending === 0 ? "All caught up" : "Awaiting your review"}
        />
        <StatCard
          label="Reviewed Submissions"
          value={String(statusCounts.reviewed)}
          icon={TrendingUp}
          caption="Total you've given feedback on"
        />
      </div>

      <WritingAiSettingsCard dailyLimit={dailyLimit} />

      {studentProgress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="text-accent size-4.5" aria-hidden="true" /> Student Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Average Band</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentProgress.map((student) => (
                  <TableRow key={student.studentId}>
                    <TableCell className="font-medium">{student.name ?? student.email}</TableCell>
                    <TableCell className="text-muted-foreground">{student.assignedCount}</TableCell>
                    <TableCell className="text-muted-foreground">{student.submittedCount}</TableCell>
                    <TableCell>{student.averageBand != null ? student.averageBand.toFixed(1) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
