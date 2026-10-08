import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mic } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getStudentScoreDetail } from "@/lib/students-scores";
import { getAssessmentOfFullMock, nudgeIfStuck, shownToStudent } from "@/lib/writing-assessment/assessment";
import { failureMessage } from "@/lib/writing-assessment/status";
import { AI_ESTIMATE_LABEL } from "@/lib/writing-assessment/constants";
import { bandText, missingText } from "@/lib/writing-assessment/bands";
import { formatDateTime } from "@/lib/format";
import { AssessmentReport } from "@/components/writing-assessment/assessment-report";
import { WritingAssessmentProgress } from "@/components/writing-assessment/assessment-progress";
import { RetryWritingAssessmentButton } from "@/components/writing-assessment/retry-button";
import { StartWritingAssessmentButton } from "@/components/writing-assessment/start-button";
import { BandCell, OverallCell, WritingCell } from "@/components/teacher/scores/score-cells";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Student scores" };
// A waiting AI assessment may be started again from this page; it runs after the response.
export const maxDuration = 120;

function SectionCard({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <Card className="gap-1 py-4" data-testid={testId}>
      <CardContent className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <div className="font-display text-3xl font-medium tabular-nums">{children}</div>
      </CardContent>
    </Card>
  );
}

/**
 * Phase O - one student's scores: the four section bands and the Overall, the Writing report of their latest Full Mock (criteria, mistakes, feedback), the criteria of their
 * latest AI speaking practice, the date of the Full Mock with links to the attempts, and the earlier Full Mocks. Teachers only; a student never sees any of it.
 */
export default async function StudentScoreDetailPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { profile } = await requireTeacherProfile();

  const detail = await getStudentScoreDetail(profile.id, studentId);
  if (!detail) notFound();
  const { scores, latestMock, speaking } = detail;

  const assessment = latestMock ? await getAssessmentOfFullMock(latestMock.attemptId) : null;
  if (assessment) nudgeIfStuck(assessment.record);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/teacher/scores">
          <ArrowLeft className="size-4" /> Students&apos; Scores
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="font-display text-2xl font-medium tracking-tight" data-testid="score-student-name">
          {detail.name ?? "(no name)"}
        </h1>
        <p className="text-muted-foreground text-sm">{detail.email}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SectionCard label="Listening" testId="detail-listening">
          <BandCell band={scores.listening} />
        </SectionCard>
        <SectionCard label="Reading" testId="detail-reading">
          <BandCell band={scores.reading} />
        </SectionCard>
        <SectionCard label="Writing" testId="detail-writing">
          <WritingCell band={scores.writing} state={scores.writingState} />
        </SectionCard>
        <SectionCard label="Speaking" testId="detail-speaking">
          <BandCell band={scores.speaking} />
        </SectionCard>
        <SectionCard label="Overall" testId="detail-overall">
          <OverallCell band={scores.overall} missing={scores.missing} />
        </SectionCard>
      </div>
      {scores.overall == null && scores.missing.length > 0 && (
        <p className="text-muted-foreground -mt-3 text-xs" data-testid="overall-missing">
          Overall needs all four skills. {missingText(scores.missing)}.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest Full Mock</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {latestMock ? (
            <>
              <p data-testid="latest-mock">
                <span className="font-medium">{latestMock.title}</span>{" "}
                <Badge variant={latestMock.mockStatus === "PUBLISHED" ? "success" : "outline"}>{latestMock.mockStatus === "ARCHIVED" ? "Archived mock" : latestMock.mockStatus === "PUBLISHED" ? "Active mock" : "Draft mock"}</Badge>
              </p>
              <p className="text-muted-foreground">
                Taken {formatDateTime(latestMock.startedAt)}
                {latestMock.completedAt ? ` · finished ${formatDateTime(latestMock.completedAt)}` : ""}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {latestMock.listeningResultId && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/teacher/band-conversation/${detail.studentId}/attempts/${latestMock.listeningResultId}`}>Listening attempt</Link>
                  </Button>
                )}
                {latestMock.readingResultId && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/teacher/band-conversation/${detail.studentId}/attempts/${latestMock.readingResultId}`}>Reading attempt</Link>
                  </Button>
                )}
                {latestMock.writingSubmissionIds.map((id, index) => (
                  <Button key={id} asChild variant="outline" size="sm">
                    <Link href={`/teacher/writing-reviews/${id}`}>Writing essay {index + 1}</Link>
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground" data-testid="no-mock">
              This student has not finished a Full Mock yet, so Listening, Reading and Writing are empty.
            </p>
          )}
        </CardContent>
      </Card>

      {latestMock && (
        <section className="space-y-4" data-testid="writing-section">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-medium tracking-tight">Writing</h2>
            <span className="text-muted-foreground text-xs">{AI_ESTIMATE_LABEL}</span>
            {assessment && !shownToStudent(assessment.record) && <Badge variant="outline">Hidden from the student</Badge>}
          </div>
          {!assessment ? (
            <Card>
              <CardContent className="space-y-3 py-5">
                {latestMock.writingSubmissionIds.length > 0 ? (
                  <>
                    <p className="text-sm">No AI assessment exists for this Writing paper yet.</p>
                    <StartWritingAssessmentButton submissionId={latestMock.writingSubmissionIds[0]} />
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No Writing was handed in during this Full Mock.</p>
                )}
              </CardContent>
            </Card>
          ) : assessment.status === "DONE" && assessment.report ? (
            <AssessmentReport report={assessment.report} bands={assessment.bands} model={assessment.record.model} />
          ) : assessment.status === "FAILED" ? (
            <Card data-testid="writing-assessment-failed">
              <CardContent className="space-y-3 py-5">
                <p className="font-medium">The AI assessment could not be completed.</p>
                <p className="text-muted-foreground text-sm">{failureMessage(assessment.record.failureCode, assessment.record.failureMessage)}</p>
                {assessment.canRetry && <RetryWritingAssessmentButton assessmentId={assessment.record.id} />}
              </CardContent>
            </Card>
          ) : (
            <WritingAssessmentProgress assessmentId={assessment.record.id} initialStatus={assessment.status} sinceIso={assessment.record.createdAt.toISOString()} leaveHref="/teacher/scores" leaveLabel="Back to Students' Scores" />
          )}
        </section>
      )}

      <section className="space-y-3" data-testid="speaking-section">
        <h2 className="font-display text-xl font-medium tracking-tight">Speaking (latest AI practice)</h2>
        {speaking ? (
          <Card>
            <CardContent className="space-y-3 py-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <p className="font-display text-3xl font-medium tabular-nums" data-testid="speaking-overall">
                  {bandText(speaking.overall)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {AI_ESTIMATE_LABEL} · practiced {formatDateTime(speaking.at)}
                </p>
                <Button asChild variant="outline" size="sm" className="sm:ml-auto">
                  <Link href={`/teacher/speaking-recordings/${speaking.practiceId}`}>
                    <Mic className="size-4" /> Open the practice
                  </Link>
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    ["Fluency & Coherence", speaking.fluency],
                    ["Lexical Resource", speaking.lexical],
                    ["Grammatical Range & Accuracy", speaking.grammar],
                    [speaking.pronunciationEstimated ? "Pronunciation (estimated)" : "Pronunciation", speaking.pronunciation],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground text-xs">{label}</dt>
                    <dd className="font-medium tabular-nums">{bandText(value)}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ) : (
          <p className="text-muted-foreground text-sm" data-testid="no-speaking">
            This student has no assessed AI speaking practice yet.
          </p>
        )}
      </section>

      <section className="space-y-3" data-testid="earlier-mocks">
        <h2 className="font-display text-xl font-medium tracking-tight">Earlier Full Mocks</h2>
        {detail.earlier.length === 0 ? (
          <p className="text-muted-foreground text-sm">No earlier Full Mock.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mock</TableHead>
                <TableHead>Finished</TableHead>
                <TableHead>Listening</TableHead>
                <TableHead>Reading</TableHead>
                <TableHead>Writing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.earlier.map((mock) => (
                <TableRow key={mock.attemptId}>
                  <TableCell className="font-medium">
                    {mock.title} {mock.mockStatus === "ARCHIVED" && <Badge variant="outline">Archived</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{mock.completedAt ? formatDateTime(mock.completedAt) : "—"}</TableCell>
                  <TableCell>
                    <BandCell band={mock.listening} />
                  </TableCell>
                  <TableCell>
                    <BandCell band={mock.reading} />
                  </TableCell>
                  <TableCell>
                    <WritingCell band={mock.writing} state={mock.writingState} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
