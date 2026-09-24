import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { TeacherAssistantChat } from "@/components/teacher/teacher-assistant-chat";

export const metadata: Metadata = { title: "AI Assistant" };

export default async function TeacherAssistantPage() {
  await requireTeacherProfile();

  return (
    <>
      <PageHeader
        title="AI Assistant"
        description="Ask about your students' real performance — every answer is grounded in their actual test, activity, and vocabulary data."
      />
      <TeacherAssistantChat />
    </>
  );
}
