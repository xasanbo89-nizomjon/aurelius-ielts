import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { SpeakingTopicForm } from "@/components/teacher/speaking-topic-form";

export const metadata: Metadata = { title: "Create Speaking Topic" };

export default async function NewSpeakingTopicPage() {
  await requireTeacherProfile();

  return (
    <>
      <PageHeader title="Create Speaking Topic" description="Practice content only — never graded, never an official result." />
      <SpeakingTopicForm />
    </>
  );
}
