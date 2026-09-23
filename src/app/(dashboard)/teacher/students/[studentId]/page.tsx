import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookMarked } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getStudentForTeacher } from "@/lib/teacher-students";
import { getStudentVocabularyStats } from "@/lib/vocabulary";
import { getStudentVocabularyActivity } from "@/lib/analytics/teacher-vocabulary-insights";
import { VOCABULARY_STATUS_LABELS, VOCABULARY_STATUS_EMOJI } from "@/lib/labels";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { VocabularyStatsCards } from "@/components/analytics/vocabulary-stats-cards";

export const metadata: Metadata = { title: "Student Vocabulary" };

export default async function TeacherStudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { studentId } = await params;

  const student = await getStudentForTeacher(profile.id, studentId, profile.isRootTeacher);
  if (!student) notFound();

  const [stats, activity] = await Promise.all([
    getStudentVocabularyStats(studentId),
    getStudentVocabularyActivity(studentId),
  ]);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/teacher/students">
          <ArrowLeft className="size-4" /> Back to Students
        </Link>
      </Button>

      <PageHeader title={student.name ?? "Student"} description={student.email} />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Vocabulary</h2>
        <VocabularyStatsCards stats={{ ...stats, totalSearches: stats.totalSearches }} />
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Recent Vocabulary Activity</h2>
        {activity.length === 0 ? (
          <EmptyState
            icon={BookMarked}
            title="No vocabulary activity yet"
            description="Words this student clicks while reading an article are automatically recorded and will appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Word</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.map((row, index) => (
                <TableRow key={`${row.word}-${index}`}>
                  <TableCell className="font-medium">{row.word}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.difficultyColor === "UNKNOWN" ? "destructive" : row.difficultyColor === "LEARNING" ? "outline" : "success"
                      }
                    >
                      {VOCABULARY_STATUS_EMOJI[row.difficultyColor]} {VOCABULARY_STATUS_LABELS[row.difficultyColor]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(row.searchedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
