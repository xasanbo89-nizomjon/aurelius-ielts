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

function formatBand(band: number | null, included = true): string {
  if (!included) return "n/a";
  return band != null ? band.toFixed(1) : "—";
}

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function formatDateTime(date: Date | null): string {
  return date ? dateTimeFormat.format(date) : "—";
}

export default async function TeacherMockResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { q } = await searchParams;

  const rows = await listMockResultsForTeacher(profile.id, q);
  // A Speaking column only appears when at least one of these mocks actually tests Speaking.
  const showSpeaking = rows.some((row) => row.includes.speaking);

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
              <TableHead>Student</TableHead>
              <TableHead>Listening</TableHead>
              <TableHead>Reading</TableHead>
              <TableHead>Writing</TableHead>
              {showSpeaking && <TableHead>Speaking</TableHead>}
              <TableHead>Overall Band</TableHead>
              <TableHead>Started At</TableHead>
              <TableHead>Completed At</TableHead>
              <TableHead>Mock Code</TableHead>
              <TableHead>Mock</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.attemptId}>
                <TableCell>
                  <p className="font-medium">{row.studentName}</p>
                  <p className="text-muted-foreground text-xs">{row.studentEmail}</p>
                </TableCell>
                <TableCell>{formatBand(row.listeningBand)}</TableCell>
                <TableCell>{formatBand(row.readingBand)}</TableCell>
                <TableCell>{formatBand(row.writingBand, row.includes.writing)}</TableCell>
                {showSpeaking && <TableCell>{formatBand(row.speakingBand, row.includes.speaking)}</TableCell>}
                <TableCell className="font-medium">{formatBand(row.overallBand)}</TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(row.startedAt)}</TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(row.completedAt)}</TableCell>
                <TableCell className="font-mono text-xs">{row.accessCode ?? "—"}</TableCell>
                <TableCell className="max-w-48 truncate">{row.mockTitle}</TableCell>
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
