"use server";

import type { StudyActivityType } from "@prisma/client";

import { requireStudentProfile } from "@/lib/session";
import { recordStudyHeartbeat, type HeartbeatResult } from "@/lib/study-activity";

/**
 * Reading/Listening study time comes exclusively from the real exam-attempt
 * duration (src/lib/exam/attempts.ts) — a client can never claim those types
 * via heartbeat, which would let it fake time without actually taking a test.
 */
const ALLOWED_HEARTBEAT_TYPES: readonly StudyActivityType[] = ["VOCABULARY", "WRITING", "ARTICLE"];

export async function recordStudyHeartbeatAction(type: string): Promise<HeartbeatResult> {
  const { profile } = await requireStudentProfile();
  if (!ALLOWED_HEARTBEAT_TYPES.includes(type as StudyActivityType)) {
    return { creditedSeconds: 0 };
  }
  return recordStudyHeartbeat(profile.id, type as StudyActivityType);
}
