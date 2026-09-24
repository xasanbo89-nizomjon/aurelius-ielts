import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookMarked, TrendingDown, TrendingUp, Minus } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getStudentForTeacher } from "@/lib/teacher-students";
import { getStudentVocabularyStats } from "@/lib/vocabulary";
import { getStudentVocabularyActivity, getStudentVocabularyTrends } from "@/lib/analytics/teacher-vocabulary-insights";
import { VOCABULARY_STATUS_LABELS, VOCABULARY_STATUS_EMOJI } from "@/lib/labels";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { VocabularyStatsCards } from "@/components/analytics/vocabulary-stats-cards";
import { VocabularyInsightsCard } from "@/components/teacher/vocabulary-insights-card";
import { TeacherAIReportCard } from "@/components/teacher/teacher-ai-report-card";

export const metadata: Metadata = { title: "Student Vocabulary" };

const TREND_META = {
  IMPROVING: { label: "Improving", icon: TrendingUp, className: "text-success" },
  WORSENING: { label: "Worsening", icon: TrendingDown, className: "text-destructive" },
  STABLE: { label: "Stable", icon: Minus, className: "text-muted-foreground" },
} as const;

export default async function TeacherStudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { studentId } = await params;

  const student = await getStudentForTeacher(profile.id, studentId, profile.isRootTeacher);
  if (!student) notFound();

  const [stats, activity, trends] = await Promise.all([
    getStudentVocabularyStats(studentId),
    getStudentVocabularyActivity(studentId),
    getStudentVocabularyTrends(studentId),
  ]);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/teacher/students">
          <ArrowLeft className="size-4" /> Back to Students
        </Link>
      </Button>

      <PageHeader title={student.name ?? "Student"} description={student.email} />

      <TeacherAIReportCard studentId={studentId} />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Vocabulary</h2>
        <VocabularyStatsCards stats={{ ...stats, totalSearches: stats.totalSearches }} />
      </section>

      <VocabularyInsightsCard studentId={studentId} />

      {trends.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-xl font-medium tracking-tight">Word Difficulty Trends</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Word</TableHead>
                <TableHead>First Search</TableHead>
                <TableHead>Latest Search</TableHead>
                <TableHead>Searches</TableHead>
                <TableHead>Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trends.map((trend) => {
                const meta = TREND_META[trend.trend];
                const TrendIcon = meta.icon;
                return (
                  <TableRow key={trend.word}>
                    <TableCell className="font-medium">{trend.word}</TableCell>
                    <TableCell>
                      {VOCABULARY_STATUS_EMOJI[trend.firstDifficulty]} {VOCABULARY_STATUS_LABELS[trend.firstDifficulty]}
                    </TableCell>
                    <TableCell>
                      {VOCABULARY_STATUS_EMOJI[trend.latestDifficulty]} {VOCABULARY_STATUS_LABELS[trend.latestDifficulty]}
                    </TableCell>
                    <TableCell>{trend.searchCount}</TableCell>
                    <TableCell>
                      <span className={`flex items-center gap-1 text-sm ${meta.className}`}>
                        <TrendIcon className="size-3.5" aria-hidden="true" /> {meta.label}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}

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
