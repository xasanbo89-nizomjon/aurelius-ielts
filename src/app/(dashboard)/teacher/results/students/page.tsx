import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { SKILL_LABELS, TEACHER_RESULTS_PAGE_SIZE, listStudentPerformanceSummaries } from "@/lib/analytics/teacher-results";
import { formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResultsSubNav } from "@/components/teacher/results/results-sub-nav";
import { AccuracyCell } from "@/components/teacher/results/result-cells";

export const metadata: Metadata = { title: "Student Summary" };

export default async function TeacherStudentSummaryPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { profile } = await requireTeacherProfile();
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const search = q?.trim() || undefined;

  const { students, total } = await listStudentPerformanceSummaries(profile.id, { search, page });
  const totalPages = Math.max(1, Math.ceil(total / TEACHER_RESULTS_PAGE_SIZE));
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (p > 1) params.set("page", String(p));
    const query = params.toString();
    return query ? `/teacher/results/students?${query}` : "/teacher/results/students";
  };

  return (
    <>
      <PageHeader
        title="Student Summary"
        description="How each of your students is doing across Reading, Listening, Writing and Full Mock — most recently active first."
      />

      <ResultsSubNav active="students" />

      <SearchInput name="q" placeholder="Search student name or email…" defaultValue={search} className="max-w-sm" />

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "No matching students" : "No students assigned yet"}
          description={search ? "Try a different search." : "Students assigned to you will appear here with their performance summary."}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Tests taken</TableHead>
                <TableHead>Average band</TableHead>
                <TableHead>Average accuracy</TableHead>
                <TableHead>Latest activity</TableHead>
                <TableHead>Strongest skill</TableHead>
                <TableHead>Weakest skill</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.studentId} className="hover:bg-secondary/40">
                  <TableCell className="min-w-48">
                    <Link href={`/teacher/students/${student.studentId}#results`} className="font-medium hover:underline">
                      {student.name ?? "—"}
                    </Link>
                    <p className="text-muted-foreground text-xs">{student.email}</p>
                  </TableCell>
                  <TableCell className="tabular-nums">{student.totalTests}</TableCell>
                  <TableCell>{student.averageBand != null ? <Badge variant="accent">{student.averageBand.toFixed(1)}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <AccuracyCell value={student.averageAccuracy} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{student.latestActivity ? formatRelativeTime(student.latestActivity) : "Never"}</TableCell>
                  <TableCell>
                    {student.strongestSkill ? (
                      <span className="text-sm">
                        {SKILL_LABELS[student.strongestSkill]} <span className="text-muted-foreground tabular-nums">{student.skillAverages[student.strongestSkill]?.toFixed(1)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {student.weakestSkill ? (
                      <span className="text-sm">
                        {SKILL_LABELS[student.weakestSkill]} <span className="text-muted-foreground tabular-nums">{student.skillAverages[student.weakestSkill]?.toFixed(1)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/teacher/results?student=${student.studentId}`} className="text-accent text-sm whitespace-nowrap underline">
                      View results
                    </Link>
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
