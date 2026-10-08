import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { SCORES_PAGE_SIZE, listStudentScores } from "@/lib/students-scores";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BandCell, OverallCell, WritingCell } from "@/components/teacher/scores/score-cells";

export const metadata: Metadata = { title: "Students' Scores" };

/**
 * Phase O - every student's Listening, Reading and Writing band (from their latest completed Full Mock), Speaking band (from their latest AI speaking practice) and the
 * Overall of the four - on one page. A teacher sees their own students, a Root Teacher everybody. Full Mock bands are for teachers only: no student page shows them.
 */
export default async function StudentsScoresPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { profile } = await requireTeacherProfile();
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const result = await listStudentScores(profile.id, { query: q, page });
  const totalPages = Math.max(1, Math.ceil(result.total / SCORES_PAGE_SIZE));
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/teacher/scores?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Students' Scores"
        description={result.isRootView ? "Every student on the platform - their latest Full Mock, latest speaking practice and Overall band." : "Your students' latest Full Mock, latest speaking practice and Overall band."}
        actions={<SearchInput name="q" placeholder="Search by name or email…" defaultValue={q} />}
      />

      {result.rows.length === 0 ? (
        <EmptyState icon={Trophy} title={q ? "No matching students" : "No students yet"} description={q ? `No student found for "${q}".` : "Students appear here once they are assigned to you."} />
      ) : (
        <>
          <Table data-testid="scores-table">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Listening</TableHead>
                <TableHead>Reading</TableHead>
                <TableHead>Writing</TableHead>
                <TableHead>Speaking</TableHead>
                <TableHead>Overall</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.studentId} data-testid={`score-row-${row.studentId}`}>
                  <TableCell className="font-medium">
                    <Link href={`/teacher/scores/${row.studentId}`} className="hover:text-accent focus-visible:text-accent underline-offset-4 outline-none hover:underline focus-visible:underline">
                      {row.name ?? "(no name)"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-56 truncate">{row.email}</TableCell>
                  <TableCell>
                    <BandCell band={row.listening} testId={`listening-${row.studentId}`} />
                  </TableCell>
                  <TableCell>
                    <BandCell band={row.reading} testId={`reading-${row.studentId}`} />
                  </TableCell>
                  <TableCell>
                    <WritingCell band={row.writing} state={row.writingState} testId={`writing-${row.studentId}`} />
                  </TableCell>
                  <TableCell>
                    <BandCell band={row.speaking} testId={`speaking-${row.studentId}`} />
                  </TableCell>
                  <TableCell>
                    <OverallCell band={row.overall} missing={row.missing} testId={`overall-${row.studentId}`} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}

      <p className="text-muted-foreground text-xs">
        Listening, Reading and Writing come from the student&apos;s latest completed Full Mock; Speaking from their latest AI speaking practice. The Overall band is the mean of the
        four, rounded to the nearest half band, and appears only when all four exist. Writing and Speaking are AI estimates, not official IELTS scores.
      </p>
    </>
  );
}
