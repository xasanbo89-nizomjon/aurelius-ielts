import type { Metadata } from "next";
import Link from "next/link";
import { Mic } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { listSpeakingSubmissionsForStudent } from "@/lib/speaking";
import { formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
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

  const submissions = await listSpeakingSubmissionsForStudent(profile.id);

  return (
    <>
      <PageHeader
        title="Speaking"
        description="Enter the code your teacher gave you, record your response, and get an instant AI band score. Your recording is never stored."
      />

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
