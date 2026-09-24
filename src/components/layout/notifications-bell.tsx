"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, Check, CheckCheck, Megaphone, Newspaper, PenLine, Mic, AlertCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  getNotificationInboxAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/actions/notifications.actions";
import type { NotificationItem, NotificationCategory } from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 60_000;

const CATEGORY_META: Record<NotificationCategory, { label: string; icon: LucideIcon }> = {
  TEACHER_UPDATE: { label: "Teacher Updates", icon: Megaphone },
  NEW_ARTICLE: { label: "New Articles", icon: Newspaper },
  WRITING_REVIEW: { label: "Writing Reviews", icon: PenLine },
  SPEAKING_REVIEW: { label: "Speaking Reviews", icon: Mic },
  SYSTEM_NOTICE: { label: "System Notices", icon: AlertCircle },
};

const CATEGORY_FILTERS: (NotificationCategory | "ALL")[] = [
  "ALL",
  "TEACHER_UPDATE",
  "NEW_ARTICLE",
  "WRITING_REVIEW",
  "SPEAKING_REVIEW",
  "SYSTEM_NOTICE",
];

/**
 * Phase 20/24 — real per-student notification state (NotificationRead),
 * across 5 real categories, plus a browser Notification popup for anything
 * new while the tab is open. Deliberately NOT push: nothing fires once the
 * tab/browser is closed — a background push pipeline (VAPID keys,
 * PushSubscription storage) is explicitly out of scope for this pass.
 */
export function NotificationsBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [filter, setFilter] = useState<NotificationCategory | "ALL">("ALL");
  const seenKeys = useRef<Set<string> | null>(null);

  const refresh = useCallback(async (notifyNew: boolean) => {
    const result = await getNotificationInboxAction();
    if (!result.success) return;

    if (notifyNew && seenKeys.current && permission === "granted" && typeof Notification !== "undefined") {
      const freshUnread = result.items.filter((item) => !item.isRead && !seenKeys.current!.has(item.key));
      for (const item of freshUnread) {
        new Notification(item.title, { body: item.content.slice(0, 140), tag: item.key });
      }
    }

    seenKeys.current = new Set(result.items.map((item) => item.key));
    setItems(result.items);
    setUnreadCount(result.unreadCount);
  }, [permission]);

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    void refresh(false);
    const interval = setInterval(() => void refresh(true), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRequestPermission(event: React.MouseEvent) {
    event.preventDefault();
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  async function handleMarkRead(itemKey: string) {
    setItems((prev) => prev.map((item) => (item.key === itemKey ? { ...item, isRead: true } : item)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await markNotificationReadAction(itemKey);
  }

  async function handleMarkAllRead() {
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    await markAllNotificationsReadAction();
  }

  const filteredItems = filter === "ALL" ? items : items.filter((item) => item.category === filter);

  return (
    <DropdownMenu onOpenChange={(open) => open && void refresh(false)}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4.5" strokeWidth={1.75} />
          {unreadCount > 0 && (
            <span className="bg-accent text-accent-foreground absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {items.length > 0 && unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-accent flex items-center gap-1 text-xs font-medium hover:underline"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-2 pb-1.5">
            {CATEGORY_FILTERS.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setFilter(category)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
                  filter === category ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/70"
                )}
              >
                {category === "ALL" ? "All" : CATEGORY_META[category].label}
              </button>
            ))}
          </div>
        )}

        {permission === "default" && (
          <button
            type="button"
            onClick={handleRequestPermission}
            className="text-muted-foreground hover:bg-secondary flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs"
          >
            <BellRing className="size-3.5 shrink-0" />
            Enable browser notifications while this site is open
          </button>
        )}

        <DropdownMenuSeparator />

        {filteredItems.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-center text-sm">
            {items.length === 0 ? "No notifications yet." : "Nothing in this category."}
          </p>
        ) : (
          filteredItems.map((item) => {
            const Icon = CATEGORY_META[item.category].icon;
            return (
              <DropdownMenuItem
                key={item.key}
                asChild
                onSelect={() => {
                  if (!item.isRead) void handleMarkRead(item.key);
                }}
                className={cn("items-start gap-2.5 py-2.5", !item.isRead && "bg-secondary/40")}
              >
                <Link href={item.href}>
                  <Icon className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", !item.isRead && "font-medium")}>{item.title}</span>
                    <span className="text-muted-foreground block truncate text-xs">{item.content}</span>
                    <span className="text-muted-foreground/70 block text-[11px]">{formatRelativeTime(item.at)}</span>
                  </span>
                  {!item.isRead && <Check className="text-muted-foreground mt-1 size-3.5 shrink-0" aria-hidden="true" />}
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
