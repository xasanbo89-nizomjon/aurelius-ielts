"use client";

import Link from "next/link";
import { Bell, ClipboardCheck, Megaphone, Newspaper, PenLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { WhatsNewItem, WhatsNewItemType } from "@/lib/whats-new";
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

const TYPE_ICON: Record<WhatsNewItemType, LucideIcon> = {
  TEST: ClipboardCheck,
  ARTICLE: Newspaper,
  WRITING_TASK: PenLine,
  ANNOUNCEMENT: Megaphone,
};

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function NotificationsBell({ items }: { items: WhatsNewItem[] }) {
  const recentCount = items.filter((item) => Date.now() - item.at.getTime() < RECENT_WINDOW_MS).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4.5" strokeWidth={1.75} />
          {recentCount > 0 && (
            <span className="bg-accent text-accent-foreground absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium">
              {recentCount > 9 ? "9+" : recentCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-center text-sm">Nothing new yet.</p>
        ) : (
          items.map((item) => {
            const Icon = TYPE_ICON[item.type];
            return (
              <DropdownMenuItem key={item.id} asChild className="items-start gap-2.5 py-2.5">
                <Link href={item.href}>
                  <Icon className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    {item.description && (
                      <span className="text-muted-foreground block truncate text-xs">{item.description}</span>
                    )}
                    <span className="text-muted-foreground/70 block text-[11px]">{formatRelativeTime(item.at)}</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
