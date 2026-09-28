import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getTeacherEffectivenessReport } from "@/lib/analytics/teacher-effectiveness";
import { PageHeader } from "@/components/dashboard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExportReportButtons } from "@/components/teacher/export-report-buttons";

export const metadata: Metadata = { title: "Teacher Effectiveness" };

export default async function TeacherEffectivenessPage() {
  const { profile } = await requireTeacherProfile();
  if (!profile.isRootTeacher) redirect("/teacher/dashboard");

  const teachers = await getTeacherEffectivenessReport();

  return (
    <>
      <PageHeader
        title="Teacher Effectiveness"
        description="Real, cross-teacher comparison — every column is a genuine count or average from that teacher's own students and content."
        actions={<ExportReportButtons kind="teacher-performance" label="Export Teacher Report" />}
      />

      {teachers.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No teachers yet" description="Teacher effectiveness rows will appear once teachers have students." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Teacher</TableHead>
              <TableHead>Students</TableHead>
              <TableHead>Avg Improvement</TableHead>
              <TableHead>Assignments</TableHead>
              <TableHead>Completion Rate</TableHead>
              <TableHead>Article Views</TableHead>
              <TableHead>Vocabulary Lookups</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teachers.map((t) => (
              <TableRow key={t.teacherId}>
                <TableCell className="font-medium">
                  {t.name ?? t.email}
                  {t.isRootTeacher && (
                    <Badge variant="outline" className="ml-2">
                      Root
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{t.studentCount}</TableCell>
                <TableCell className={t.avgStudentImprovement != null && t.avgStudentImprovement > 0 ? "text-success" : undefined}>
                  {t.avgStudentImprovement != null
                    ? `${t.avgStudentImprovement > 0 ? "+" : ""}${t.avgStudentImprovement.toFixed(2)} (n=${t.studentsWithImprovementData})`
                    : "Not enough data"}
                </TableCell>
                <TableCell>{t.totalAssignments}</TableCell>
                <TableCell>{t.completionRate != null ? `${t.completionRate}%` : "—"}</TableCell>
                <TableCell>{t.articleViews}</TableCell>
                <TableCell>{t.vocabularyLookups}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
