"use server";

import { z } from "zod";

import { requireTeacherProfile } from "@/lib/session";
import { getMockMonitorSnapshot, type MonitorSnapshot } from "@/lib/mock-monitor";
import { endFullMockSectionEarly } from "@/lib/full-mock-attempts";

const idSchema = z.string().trim().min(1).max(64);

export type MonitorSnapshotResult = { success: true; snapshot: MonitorSnapshot } | { success: false; error: string };

/** The live table's poll: one light snapshot of the teacher's own sittings (a Root Teacher's: everybody's). */
export async function getMockMonitorAction(fullMockTestId?: string | null): Promise<MonitorSnapshotResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const snapshot = await getMockMonitorSnapshot({ teacherId: profile.id, isRoot: profile.isRootTeacher }, { fullMockTestId: fullMockTestId ? idSchema.parse(fullMockTestId) : null });
    return { success: true, snapshot };
  } catch {
    return { success: false, error: "Could not load the live table." };
  }
}

export type EndSectionResult = { success: true; ended: "LISTENING" | "READING" | "WRITING" } | { success: false; error: string };

/** "End section" (after the teacher's confirmation): finalises the student's running section exactly like its clock running out - scored with what was saved. */
export async function endMockSectionAction(attemptId: string): Promise<EndSectionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const done = await endFullMockSectionEarly(idSchema.parse(attemptId), { teacherId: profile.id, isRoot: profile.isRootTeacher });
    return done.ok ? { success: true, ended: done.ended } : { success: false, error: done.error };
  } catch {
    return { success: false, error: "Could not end the section. Please try again." };
  }
}
