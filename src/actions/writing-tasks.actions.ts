"use server";

import { revalidatePath } from "next/cache";

import { requireTeacherProfile } from "@/lib/session";
import * as writingTasks from "@/lib/writing-tasks";
import { friendlyErrorMessage } from "@/lib/validation-error";
import { createWritingTaskSchema, writingTaskStatusSchema, type CreateWritingTaskInput } from "@/lib/validations/writing";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export async function createWritingTaskAction(input: CreateWritingTaskInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createWritingTaskSchema.parse(input);
    await writingTasks.createWritingTask(profile.id, parsed);
    revalidatePath("/teacher/writing");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the task.") };
  }
}

export async function updateWritingTaskAction(taskId: string, input: CreateWritingTaskInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createWritingTaskSchema.parse(input);
    await writingTasks.updateWritingTask(taskId, profile.id, parsed);
    revalidatePath("/teacher/writing");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the task.") };
  }
}

export async function setWritingTaskStatusAction(taskId: string, status: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = writingTaskStatusSchema.parse(status);
    await writingTasks.setWritingTaskStatus(taskId, profile.id, parsed);
    revalidatePath("/teacher/writing");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the task.") };
  }
}

export async function deleteWritingTaskAction(taskId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await writingTasks.deleteWritingTask(taskId, profile.id);
    revalidatePath("/teacher/writing");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the task.") };
  }
}
