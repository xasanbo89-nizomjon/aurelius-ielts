import type { Metadata } from "next";
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

const STATUS_LABEL = { PENDING: "Awaiting Review", IN_REVIEW: "In Review", REVIEWED: "Reviewed", DRAFT: "Draft" } as const;
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
        description="Enter the code your teacher gave you, record your response, and submit it for review."
      />

      <SpeakingCodeEntry />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Your Submissions</h2>
        {submissions.length === 0 ? (
          <EmptyState
            icon={Mic}
            title="No speaking submissions yet"
            description="Enter a code above to find your first speaking task."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Part</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-medium">{submission.taskTitle}</TableCell>
                  <TableCell className="text-muted-foreground">Part {submission.part}</TableCell>
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
