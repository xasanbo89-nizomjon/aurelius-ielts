import type { Metadata } from "next";
import { Trophy } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { listMockResultsForTeacher, type MockSectionScore } from "@/lib/mock-access-codes";
import { formatDateTime, formatTimeUsed } from "@/lib/format";
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

/** "32/40" over "Band 7.5" — the marks and the band they earned, so a teacher reads both without opening the attempt. */
function SectionScoreCell({ score, band, pendingLabel }: { score: MockSectionScore | null; band: number | null; pendingLabel: string }) {
  if (!score) return <span className="text-muted-foreground text-xs">{pendingLabel}</span>;
  return (
    <>
      <p className="font-medium tabular-nums">
        {score.correct}/{score.total}
      </p>
      <p className="text-muted-foreground text-xs tabular-nums">Band {formatBand(band)}</p>
    </>
  );
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
        description="Every student's Full Mock sitting — marks and band per section, scored with the official IELTS conversion table and Overall Band rounding."
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
              <TableHead>Test</TableHead>
              <TableHead>Listening</TableHead>
              <TableHead>Reading</TableHead>
              <TableHead>Writing</TableHead>
              {showSpeaking && <TableHead>Speaking</TableHead>}
              <TableHead>Overall (unofficial)</TableHead>
              <TableHead>Completion Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started At</TableHead>
              <TableHead>Completed At</TableHead>
              <TableHead>Mock Code</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.attemptId} data-testid="mock-result-row">
                <TableCell>
                  <p className="font-medium">{row.studentName}</p>
                  <p className="text-muted-foreground text-xs">{row.studentEmail}</p>
                </TableCell>
                <TableCell className="max-w-32 truncate" title={row.mockTitle}>
                  {row.mockTitle}
                </TableCell>
                <TableCell data-testid="listening-cell">
                  <SectionScoreCell score={row.listeningScore} band={row.listeningBand} pendingLabel={row.currentSection === "Listening" ? "In progress" : "Not started"} />
                </TableCell>
                <TableCell data-testid="reading-cell">
                  <SectionScoreCell
                    score={row.readingScore}
                    band={row.readingBand}
                    pendingLabel={row.currentSection === "Reading" ? "In progress" : "Not started"}
                  />
                </TableCell>
                <TableCell data-testid="writing-cell">
                  {row.includes.writing ? (
                    <>
                      <p className="font-medium whitespace-nowrap tabular-nums">{row.writingBand != null ? `Band ${formatBand(row.writingBand)}` : "—"}</p>
                      <p className="text-muted-foreground text-xs">{row.writingStatus}</p>
                    </>
                  ) : (
                    "n/a"
                  )}
                </TableCell>
                {showSpeaking && <TableCell>{formatBand(row.speakingBand, row.includes.speaking)}</TableCell>}
                <TableCell className="font-medium" data-testid="overall-cell">
                  <p className="tabular-nums">{formatBand(row.overallBand)}</p>
                  <p className="text-muted-foreground text-xs font-normal">{row.overallBand != null ? row.overallLabel : row.includes.writing ? "needs Writing review" : ""}</p>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap" data-testid="duration-cell">
                  {formatTimeUsed(row.durationSeconds)}
                </TableCell>
                <TableCell data-testid="status-cell">
                  <Badge variant={row.status === "COMPLETED" ? "success" : "outline"}>
                    {row.status === "COMPLETED" ? "Completed" : "In Progress"}
                  </Badge>
                  {row.currentSection && <p className="text-muted-foreground mt-1 text-xs">{row.currentSection}</p>}
                  {row.hadTimeExpiry && <p className="text-muted-foreground mt-1 text-xs" data-testid="expired-note">Time expired</p>}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(row.startedAt)}</TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(row.completedAt)}</TableCell>
                <TableCell className="font-mono text-xs">{row.accessCode ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
