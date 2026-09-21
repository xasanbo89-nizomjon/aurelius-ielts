"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import type { NotificationFeed } from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationsMenu({ items, totalCount }: NotificationFeed) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={totalCount > 0 ? `Notifications, ${totalCount} unread` : "Notifications"}
        >
          <Bell className="size-5" strokeWidth={1.75} />
          {totalCount > 0 && (
            <span
              aria-hidden="true"
              className="bg-accent text-accent-foreground absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium"
            >
              {totalCount > 9 ? "9+" : totalCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="text-muted-foreground px-2.5 py-6 text-center text-sm">
            You&apos;re all caught up.
          </p>
        ) : (
          <div className="flex flex-col">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="hover:bg-secondary focus-visible:bg-secondary flex flex-col gap-0.5 rounded-lg px-2.5 py-2.5 text-sm outline-none"
              >
                <span className="font-medium">{item.title}</span>
                <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                  <span>{item.description}</span>
                  <span className="shrink-0">{formatRelativeTime(item.createdAt)}</span>
                </span>
              </Link>
            ))}
            {totalCount > items.length && (
              <p className="text-muted-foreground px-2.5 pt-2 text-center text-xs">
                +{totalCount - items.length} more
              </p>
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
