import type { Metadata } from "next";
import { BookOpenCheck } from "lucide-react";

import { getPublishedTestsByCategory } from "@/lib/mock-tests";
import { TestCategoryView } from "@/components/dashboard/test-category-view";

export const metadata: Metadata = { title: "Reading + Listening Tests" };

export default async function ReadingListeningTestsPage() {
  const tests = await getPublishedTestsByCategory("GENERAL");

  return (
    <TestCategoryView
      title="Reading + Listening Tests"
      description="Practice tests from your teacher, timed the same way as the real exam."
      icon={BookOpenCheck}
      free={false}
      tests={tests}
    />
  );
}
