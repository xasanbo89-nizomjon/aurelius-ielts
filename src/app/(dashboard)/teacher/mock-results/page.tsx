import type { Metadata } from "next";
import { Trophy } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { listMockResultsForTeacher } from "@/lib/mock-access-codes";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExportMockResultsButtons } from "@/components/teacher/export-mock-results-buttons";

export const metadata: Metadata = { title: "Mock Results" };

function formatBand(band: number | null): string {
  return band != null ? band.toFixed(1) : "—";
}

export default async function TeacherMockResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { q } = await searchParams;

  const rows = await listMockResultsForTeacher(profile.id, q);

  return (
    <>
      <PageHeader
        title="Mock Results"
        description="Every student's Full Mock sitting, scored with the official IELTS Overall Band rounding."
        actions={<ExportMockResultsButtons search={q} />}
      />

      <SearchInput name="q" placeholder="Search by code, student, or mock…" defaultValue={q} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={q ? "No matching results" : "No mock attempts yet"}
          description={q ? `No results found for "${q}". Try a different search.` : "Results appear here once a student starts a Full Mock Test."}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Access Code</TableHead>
              <TableHead>Mock</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Reading</TableHead>
              <TableHead>Listening</TableHead>
              <TableHead>Writing</TableHead>
              <TableHead>Speaking</TableHead>
              <TableHead>Overall Band</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.attemptId}>
                <TableCell className="font-mono text-xs">{row.accessCode ?? "—"}</TableCell>
                <TableCell className="max-w-48 truncate">{row.mockTitle}</TableCell>
                <TableCell>{row.studentName}</TableCell>
                <TableCell>{formatBand(row.readingBand)}</TableCell>
                <TableCell>{formatBand(row.listeningBand)}</TableCell>
                <TableCell>{formatBand(row.writingBand)}</TableCell>
                <TableCell>{formatBand(row.speakingBand)}</TableCell>
                <TableCell className="font-medium">{formatBand(row.overallBand)}</TableCell>
                <TableCell>
                  <Badge variant={row.status === "COMPLETED" ? "success" : "outline"}>
                    {row.status === "COMPLETED" ? "Completed" : "In Progress"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
