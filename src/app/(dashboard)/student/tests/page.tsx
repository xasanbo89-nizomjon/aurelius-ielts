import type { Metadata } from "next";
import { ClipboardCheck, Landmark, BookOpenCheck, Plus } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { HomeHubCard } from "@/components/dashboard/home-hub-card";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Tests" };

export default function StudentTestsHubPage() {
  return (
    <>
      <PageHeader title="Tests" description="Choose a category, or sit the full exam under real timing." />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <HomeHubCard
          title="Cambridge Tests"
          description="Official-style practice tests — free for every student, no subscription required."
          href="/student/tests/cambridge"
          icon={Landmark}
        />
        <HomeHubCard
          title="Reading + Listening Tests"
          description="Practice tests from your teacher, timed the same way as the real exam."
          href="/student/tests/practice"
          icon={BookOpenCheck}
        />
        <HomeHubCard
          title="Mock Tests"
          description="Sit all four sections back-to-back under real exam timing."
          href="/student/mock-test"
          icon={ClipboardCheck}
        />
        <Card className="flex h-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed p-7 opacity-70 sm:p-8">
          <span className="bg-secondary text-muted-foreground flex size-14 items-center justify-center rounded-2xl">
            <Plus className="size-7" strokeWidth={1.5} />
          </span>
          <p className="text-muted-foreground text-center text-sm">More test types coming soon</p>
        </Card>
      </div>
    </>
  );
}
