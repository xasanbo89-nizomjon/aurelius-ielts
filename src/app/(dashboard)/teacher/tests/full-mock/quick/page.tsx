import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { sweepStaleUploads } from "@/lib/full-mock-quick-build";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { FullMockQuickBuilder } from "@/components/teacher/full-mock-quick-builder";

export const metadata: Metadata = { title: "Build Full Mock from Files" };

export default async function QuickBuildFullMockPage() {
  const { profile } = await requireTeacherProfile();
  // Housekeeping: files an earlier, abandoned build uploaded and nothing ever used (older than a day) are removed.
  void sweepStaleUploads(profile.id);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/teacher/tests">
          <ArrowLeft className="size-4" /> Back to tests
        </Link>
      </Button>
      <PageHeader
        title="Build Full Mock from Files"
        description="Upload the Listening PDF and audio, the Reading PDF and the Writing Task PDF — Listening, Reading and Writing are created and linked into one Full Mock for you."
      />
      <FullMockQuickBuilder />
    </>
  );
}
