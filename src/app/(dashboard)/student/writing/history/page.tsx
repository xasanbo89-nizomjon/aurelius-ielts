import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, PenLine } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getStudentSubmissions } from "@/lib/ai/writing";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { WritingSubmissionsTable } from "@/components/student/writing-submissions-table";

export const metadata: Metadata = { title: "Writing History" };

export default async function WritingHistoryPage() {
  const { profile } = await requireStudentProfile();
  const submissions = await getStudentSubmissions(profile.id);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 -mb-2 w-fit">
        <Link href="/student/writing">
          <ArrowLeft className="size-4" /> Back to Writing Center
        </Link>
      </Button>

      <PageHeader
        title="Writing History"
        description="Every essay you've drafted or submitted — real band history, feedback, and submission dates."
      />

      {submissions.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title="No submissions yet"
          description="Submit your first Task 1 or Task 2 response to see it here."
        />
      ) : (
        <WritingSubmissionsTable submissions={submissions} />
      )}
    </>
  );
}
