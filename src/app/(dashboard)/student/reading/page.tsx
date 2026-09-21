import type { Metadata } from "next";
import { BookOpen } from "lucide-react";

import { SkillPracticeView } from "@/components/dashboard/skill-practice-view";

export const metadata: Metadata = { title: "Reading" };

export default function ReadingPage() {
  return (
    <SkillPracticeView
      type="READING"
      title="Reading"
      description="Timed passages covering Academic and General Training question types."
      icon={BookOpen}
    />
  );
}
