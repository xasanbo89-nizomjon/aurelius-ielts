import type { Metadata } from "next";
import { Headphones } from "lucide-react";
import type { MockTestDifficulty } from "@prisma/client";

import { getGeneralTestsByType } from "@/lib/mock-tests";
import { getSkillCoverImage } from "@/lib/skill-cover-images";
import { GeneralTestListView } from "@/components/dashboard/general-test-list-view";
import { SkillCoverBanner } from "@/components/student/skill-cover-banner";

export const metadata: Metadata = { title: "Listening Tests" };

const VALID_DIFFICULTIES: MockTestDifficulty[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

export default async function ListeningTestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; difficulty?: string }>;
}) {
  const { q, difficulty: difficultyParam } = await searchParams;
  const difficulty = VALID_DIFFICULTIES.includes(difficultyParam as MockTestDifficulty)
    ? (difficultyParam as MockTestDifficulty)
    : undefined;

  const [tests, cover] = await Promise.all([
    getGeneralTestsByType("LISTENING", { search: q, difficulty }),
    getSkillCoverImage("LISTENING"),
  ]);

  return (
    <div className="space-y-5">
      <SkillCoverBanner cover={cover} />
      <GeneralTestListView
        title="Listening Tests"
        description="Practice tests from your teacher, timed the same way as the real exam."
        icon={Headphones}
        basePath="/student/tests/listening"
        examBasePath="/student/exam"
        tests={tests}
        search={q}
        difficulty={difficulty}
      />
    </div>
  );
}
