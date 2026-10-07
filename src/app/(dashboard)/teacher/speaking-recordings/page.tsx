import type { Metadata } from "next";
import Link from "next/link";
import { AudioLines, BarChart3 } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { listForTeacher, studentsWithPractices, type TeacherListFilter } from "@/lib/speaking-audio/practice";
import { STATUS_LABEL, type PracticeStatus } from "@/lib/speaking-audio/status";
import { bandText, dateTimeText, snippet } from "@/lib/speaking-audio/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Speaking Recordings" };

const STATUSES: PracticeStatus[] = ["DONE", "PENDING", "PROCESSING", "FAILED"];
const SELECT_CLASS = "border-input bg-card h-9 rounded-full border px-3 text-sm";

export default async function TeacherSpeakingRecordingsPage({ searchParams }: { searchParams: Promise<{ student?: string; status?: string; part?: string; page?: string }> }) {
  const { profile } = await requireTeacherProfile();
  const query = await searchParams;

  const filter: TeacherListFilter = {
    studentId: query.student || undefined,
    status: STATUSES.includes(query.status as PracticeStatus) ? (query.status as PracticeStatus) : undefined,
    part: query.part === "1" ? 1 : query.part === "2" ? 2 : query.part === "3" ? 3 : undefined,
    page: Math.max(1, Number(query.page) || 1),
  };
  const [result, students] = await Promise.all([listForTeacher(profile.id, filter), studentsWithPractices(profile.id)]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const link = (page: number) => {
    const params = new URLSearchParams();
    if (query.student) params.set("student", query.student);
    if (query.status) params.set("status", query.status);
    if (query.part) params.set("part", query.part);
    if (page > 1) params.set("page", String(page));
    const text = params.toString();
    return `/teacher/speaking-recordings${text ? `?${text}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Speaking Recordings"
        description={
          profile.isRootTeacher
            ? "Every student's recorded Speaking practice with its AI assessment. Open one to listen to it and leave a comment."
            : "Your students' recorded Speaking practices with their AI assessment. Open one to listen to it and leave a comment."
        }
        actions={
          profile.isRootTeacher ? (
            <Button asChild variant="outline">
              <Link href="/teacher/speaking-recordings/usage">
                <BarChart3 className="size-4" /> Usage and cost
              </Link>
            </Button>
          ) : undefined
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3" data-testid="recordings-filter">
        <label className="text-muted-foreground space-y-1 text-xs">
          Student
          <select name="student" defaultValue={query.student ?? ""} className={`${SELECT_CLASS} block`} data-testid="filter-student">
            <option value="">All students</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name ?? student.email}
              </option>
            ))}
          </select>
        </label>
        <label className="text-muted-foreground space-y-1 text-xs">
          Part
          <select name="part" defaultValue={query.part ?? ""} className={`${SELECT_CLASS} block`} data-testid="filter-part">
            <option value="">Any part</option>
            <option value="1">Part 1</option>
            <option value="2">Part 2</option>
            <option value="3">Part 3</option>
          </select>
        </label>
        <label className="text-muted-foreground space-y-1 text-xs">
          Status
          <select name="status" defaultValue={query.status ?? ""} className={`${SELECT_CLASS} block`} data-testid="filter-status">
            <option value="">Any status</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">
          Apply
        </Button>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState icon={AudioLines} title="No recordings" description={query.student || query.status || query.part ? "Nothing matches these filters." : "When students record answers in Speaking Practice, they appear here."} />
      ) : (
        <>
          <Table data-testid="recordings-table">
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Part</TableHead>
                <TableHead>Overall</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Comments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.id} data-testid="recording-row" data-student={row.studentId} data-status={row.status}>
                  <TableCell className="font-medium">{row.student.user.name ?? row.student.user.email}</TableCell>
                  <TableCell className="max-w-xs">
                    <Link href={`/teacher/speaking-recordings/${row.id}`} className="hover:text-accent underline-offset-2 hover:underline">
                      {snippet(row.question, 70)}
                    </Link>
                  </TableCell>
                  <TableCell>{row.part}</TableCell>
                  <TableCell>{row.status === "DONE" ? <span className="font-display text-lg tabular-nums">{bandText(row.overallBand)}</span> : <Badge variant={row.status === "FAILED" ? "destructive" : "secondary"}>{STATUS_LABEL[row.status]}</Badge>}</TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{dateTimeText(row.submittedAt ?? row.createdAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row._count.comments}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              {result.total} recording{result.total === 1 ? "" : "s"} - page {result.page} of {pages}
            </p>
            <div className="flex gap-2">
              {result.page > 1 && (
                <Button asChild variant="outline" size="sm">
                  <Link href={link(result.page - 1)}>Previous</Link>
                </Button>
              )}
              {result.page < pages && (
                <Button asChild variant="outline" size="sm">
                  <Link href={link(result.page + 1)}>Next</Link>
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
