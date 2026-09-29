import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTeacherProfile } from "@/lib/session";
import { getSpeakingTopicForTeacher } from "@/lib/speaking-practice";
import { PageHeader } from "@/components/dashboard/page-header";
import { SpeakingTopicForm } from "@/components/teacher/speaking-topic-form";
import { SpeakingTopicQuestionsManager } from "@/components/teacher/speaking-topic-questions-manager";
import { SpeakingTopicStatusActions } from "@/components/teacher/speaking-topic-status-actions";

export const metadata: Metadata = { title: "Edit Speaking Topic" };

function toBulletPoints(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export default async function EditSpeakingTopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const { profile } = await requireTeacherProfile();

  const topic = await getSpeakingTopicForTeacher(topicId, profile.id);
  if (!topic) notFound();

  return (
    <>
      <PageHeader
        title={topic.title}
        description="Practice content only — never graded, never an official result."
        actions={<SpeakingTopicStatusActions topicId={topic.id} status={topic.status} />}
      />

      <SpeakingTopicForm
        existingTopic={{
          id: topic.id,
          title: topic.title,
          part: topic.part,
          cueCardDescription: topic.cueCardDescription,
          cueCardBulletPoints: toBulletPoints(topic.cueCardBulletPoints),
          cueCardFollowUp: topic.cueCardFollowUp,
        }}
      />

      {topic.part !== "PART_2" && (
        <SpeakingTopicQuestionsManager
          topicId={topic.id}
          questions={topic.questions.map((q) => ({ id: q.id, prompt: q.prompt }))}
        />
      )}
    </>
  );
}
