import type { Metadata } from "next";
import { BookOpen, ClipboardCheck, Headphones, Plus } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { SkillCard } from "@/components/dashboard/skill-card";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Tests" };

export default function StudentTestsHubPage() {
  return (
    <>
      <PageHeader title="Tests" description="Choose a skill to practice, or sit the full exam under real timing." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkillCard
          title="Reading Tests"
          description="Work through academic and general passages against the clock."
          href="/student/reading"
          icon={BookOpen}
        />
        <SkillCard
          title="Listening Tests"
          description="Sharpen comprehension with audio-based question sets."
          href="/student/listening"
          icon={Headphones}
        />
        <SkillCard
          title="Full Mock Tests"
          description="Sit all four sections back-to-back under real exam timing."
          href="/student/mock-test"
          icon={ClipboardCheck}
        />
        <Card className="h-full gap-5 border-dashed py-6 opacity-70">
          <div className="flex items-start justify-between px-6">
            <span className="bg-secondary text-muted-foreground flex size-11 items-center justify-center rounded-xl">
              <Plus className="size-5.5" strokeWidth={1.75} />
            </span>
          </div>
          <div className="flex-1 space-y-1.5 px-6">
            <h3 className="font-display text-muted-foreground text-lg font-medium">More coming soon</h3>
            <p className="text-muted-foreground text-sm">New test types will appear here as your teacher adds them.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
