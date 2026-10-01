import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import type { MockTestDifficulty } from "@prisma/client";

import { getGeneralTestsByType } from "@/lib/mock-tests";
import { getSkillCoverImage } from "@/lib/skill-cover-images";
import { GeneralTestListView } from "@/components/dashboard/general-test-list-view";
import { SkillCoverBanner } from "@/components/student/skill-cover-banner";

export const metadata: Metadata = { title: "Reading Tests" };

const VALID_DIFFICULTIES: MockTestDifficulty[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

export default async function ReadingTestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; difficulty?: string }>;
}) {
  const { q, difficulty: difficultyParam } = await searchParams;
  const difficulty = VALID_DIFFICULTIES.includes(difficultyParam as MockTestDifficulty)
    ? (difficultyParam as MockTestDifficulty)
    : undefined;

  const [tests, cover] = await Promise.all([
    getGeneralTestsByType("READING", { search: q, difficulty }),
    getSkillCoverImage("READING"),
  ]);

  return (
    <div className="space-y-5">
      <SkillCoverBanner cover={cover} />
      <GeneralTestListView
        title="Reading Tests"
        description="Practice tests from your teacher, timed the same way as the real exam."
        icon={BookOpen}
        basePath="/student/tests/reading"
        examBasePath="/student/exam"
        tests={tests}
        search={q}
        difficulty={difficulty}
      />
    </div>
  );
}
