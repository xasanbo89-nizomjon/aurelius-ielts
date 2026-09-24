"use server";

import { requireStudentProfile } from "@/lib/session";
import {
  getNotificationInbox,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from "@/lib/notifications";
import { friendlyErrorMessage } from "@/lib/validation-error";

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export type GetNotificationInboxResult =
  | { success: true; items: NotificationItem[]; unreadCount: number }
  | { success: false; error: string };

/** Polled by the bell on open and on an interval while the tab is open — see NotificationsBell. */
export async function getNotificationInboxAction(): Promise<GetNotificationInboxResult> {
  try {
    const { profile } = await requireStudentProfile();
    const items = await getNotificationInbox(profile.id, profile.teacherId);
    return { success: true, items, unreadCount: getUnreadCount(items) };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not load notifications.") };
  }
}

export type ActionResult = { success: true } | { success: false; error: string };

export async function markNotificationReadAction(itemKey: string): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await markNotificationRead(profile.id, itemKey);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not mark that notification as read.") };
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await markAllNotificationsRead(profile.id, profile.teacherId);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not mark notifications as read.") };
  }
}
