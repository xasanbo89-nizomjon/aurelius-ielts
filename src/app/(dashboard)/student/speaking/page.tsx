import type { Metadata } from "next";
import Link from "next/link";
import { Mic, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { listSpeakingSubmissionsForStudent } from "@/lib/speaking";
import { getSkillCoverImage } from "@/lib/skill-cover-images";
import { formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { SkillCoverBanner } from "@/components/student/skill-cover-banner";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SpeakingCodeEntry } from "@/components/student/speaking-code-entry";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";

export const metadata: Metadata = { title: "Speaking" };

const STATUS_LABEL = { PENDING: "Evaluating…", IN_REVIEW: "Evaluating…", REVIEWED: "Evaluated", DRAFT: "Draft" } as const;
const STATUS_VARIANT = { PENDING: "outline", IN_REVIEW: "outline", REVIEWED: "success", DRAFT: "outline" } as const;

export default async function StudentSpeakingPage() {
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    return <PremiumLockScreen feature="Speaking" />;
  }

  const [submissions, cover] = await Promise.all([listSpeakingSubmissionsForStudent(profile.id), getSkillCoverImage("SPEAKING")]);

  return (
    <>
      <SkillCoverBanner cover={cover} />
      <PageHeader
        title="Speaking"
        description="Enter the code your teacher gave you, record your response, and get an instant AI band score. Your recording is never stored."
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/80 via-sky-50/60 to-indigo-50/80 dark:from-slate-900/80 dark:via-blue-950/40 dark:to-slate-900/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-sm text-blue-950 dark:text-blue-100">
              AI Live Examiner Mode (GoPrep Style)
            </h3>
            <p className="text-xs text-blue-900/70 dark:text-blue-200/70">
              Practice real-time spoken conversation with AI Examiner Sarah and get instant IELTS Band Scores.
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shrink-0 gap-1.5 shadow">
          <Link href="/student/speaking-practice">
            Launch Live Examiner <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <SpeakingCodeEntry />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Your Attempts</h2>
        {submissions.length === 0 ? (
          <EmptyState
            icon={Mic}
            title="No speaking attempts yet"
            description="Enter a code above to find your first speaking task."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Part</TableHead>
                <TableHead>Band</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => (
                <TableRow key={submission.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/student/speaking/${submission.id}`} className="hover:underline">
                      {submission.taskTitle}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">Part {submission.part}</TableCell>
                  <TableCell className="tabular-nums">{submission.bandScore != null ? submission.bandScore.toFixed(1) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[submission.status]}>{STATUS_LABEL[submission.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(submission.submittedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
