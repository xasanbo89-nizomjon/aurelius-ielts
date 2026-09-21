import type { Metadata } from "next";
import { Headphones } from "lucide-react";

import { SkillPracticeView } from "@/components/dashboard/skill-practice-view";

export const metadata: Metadata = { title: "Listening" };

export default function ListeningPage() {
  return (
    <SkillPracticeView
      type="LISTENING"
      title="Listening"
      description="Audio-based comprehension practice, scored against the official IELTS band descriptors."
      icon={Headphones}
    />
  );
}
