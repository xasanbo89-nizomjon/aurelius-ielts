import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";

import { SkillPracticeView } from "@/components/dashboard/skill-practice-view";

export const metadata: Metadata = { title: "Full Mock Test" };

export default function MockTestPage() {
  return (
    <SkillPracticeView
      type="FULL_MOCK"
      title="Full Mock Test"
      description="Sit all four sections back-to-back under real exam timing."
      icon={ClipboardCheck}
    />
  );
}
