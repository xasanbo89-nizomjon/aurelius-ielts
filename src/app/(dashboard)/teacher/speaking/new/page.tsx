import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { CreateSpeakingTaskForm } from "@/components/teacher/create-speaking-task-form";

export const metadata: Metadata = { title: "Create Speaking Task" };

export default function NewSpeakingTaskPage() {
  return (
    <>
      <PageHeader title="Create a speaking task" description="Students will enter its code to record a response." />
      <CreateSpeakingTaskForm />
    </>
  );
}
