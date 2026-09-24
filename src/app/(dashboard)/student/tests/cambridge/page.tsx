import type { Metadata } from "next";
import { Landmark } from "lucide-react";

import { getPublishedTestsByCategory } from "@/lib/mock-tests";
import { TestCategoryView } from "@/components/dashboard/test-category-view";

export const metadata: Metadata = { title: "Cambridge Tests" };

export default async function CambridgeTestsPage() {
  const tests = await getPublishedTestsByCategory("CAMBRIDGE");

  return (
    <TestCategoryView
      title="Cambridge Tests"
      description="Official-style Cambridge practice tests — free for every student, no subscription required."
      icon={Landmark}
      free
      tests={tests}
    />
  );
}
