import "server-only";

import { prisma } from "@/lib/prisma";
import { PART_FROM_ENUM } from "@/lib/speaking-audio/constants";
import type { StudioTopic } from "@/lib/speaking-audio/studio-types";

/**
 * Phase Q-B - the published Speaking Topics (the teachers' topic bank of the typed Speaking Practice Center) as the recording screen's question picker needs them.
 * Only PUBLISHED topics, and only what is shown: a title, the questions of a Part 1 / 3 topic, the cue card of a Part 2 topic.
 */
export async function loadStudioTopics(): Promise<StudioTopic[]> {
  const rows = await prisma.speakingTopic.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ part: "asc" }, { title: "asc" }],
    take: 300,
    select: {
      id: true,
      title: true,
      part: true,
      cueCardDescription: true,
      cueCardBulletPoints: true,
      cueCardFollowUp: true,
      questions: { orderBy: { orderIndex: "asc" }, select: { id: true, prompt: true } },
    },
  });

  const topics: StudioTopic[] = [];
  for (const row of rows) {
    const part = PART_FROM_ENUM[row.part];
    if (part === 2) {
      const description = row.cueCardDescription?.trim();
      if (!description) continue;
      const points = Array.isArray(row.cueCardBulletPoints) ? row.cueCardBulletPoints.filter((point): point is string => typeof point === "string" && point.trim().length > 0) : [];
      const followUp = row.cueCardFollowUp?.trim();
      topics.push({ id: row.id, title: row.title, part, questions: [], cue: { description, points: followUp ? [...points, followUp] : points } });
    } else if (row.questions.length > 0) {
      topics.push({ id: row.id, title: row.title, part, questions: row.questions, cue: null });
    }
  }
  return topics;
}
