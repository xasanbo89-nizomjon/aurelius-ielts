import type { Metadata } from "next";
import { Mic } from "lucide-react";

import { SkillPracticeView } from "@/components/dashboard/skill-practice-view";

export const metadata: Metadata = { title: "Speaking" };

export default function SpeakingPage() {
  return (
    <SkillPracticeView
      type="SPEAKING"
      title="Speaking"
      description="Recorded responses across Parts 1, 2 and 3, reviewed and scored by your teacher."
      icon={Mic}
    />
  );
}
