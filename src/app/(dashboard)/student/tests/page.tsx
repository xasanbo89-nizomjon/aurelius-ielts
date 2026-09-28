import type { Metadata } from "next";
import { BookOpen, ClipboardCheck, Headphones, Landmark } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { HomeHubCard } from "@/components/dashboard/home-hub-card";

export const metadata: Metadata = { title: "Tests" };

export default function StudentTestsHubPage() {
  return (
    <>
      <PageHeader title="Tests" description="Choose a category, or sit the full exam under real timing." />

      <div className="grid grid-cols-1 gap-3 sm:gap-5 sm:grid-cols-2">
        <HomeHubCard
          title="Cambridge Tests"
          description="Official-style practice tests — free for every student, no subscription required."
          href="/student/tests/cambridge"
          icon={Landmark}
        />
        <HomeHubCard
          title="Reading Tests"
          description="Practice reading tests from your teacher, timed the same way as the real exam."
          href="/student/tests/reading"
          icon={BookOpen}
        />
        <HomeHubCard
          title="Listening Tests"
          description="Practice listening tests from your teacher, timed the same way as the real exam."
          href="/student/tests/listening"
          icon={Headphones}
        />
        <HomeHubCard
          title="Full Mock Tests"
          description="Sit all four sections back-to-back under real exam timing."
          href="/student/tests/mock"
          icon={ClipboardCheck}
        />
      </div>
    </>
  );
}
