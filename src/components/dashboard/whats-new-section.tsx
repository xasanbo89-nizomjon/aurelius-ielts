import Link from "next/link";
import { ClipboardCheck, Megaphone, Newspaper, PenLine, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { WhatsNewItem, WhatsNewItemType } from "@/lib/whats-new";
import { formatRelativeTime } from "@/lib/format";
import { EmptyState } from "@/components/dashboard/empty-state";

const TYPE_ICON: Record<WhatsNewItemType, LucideIcon> = {
  TEST: ClipboardCheck,
  ARTICLE: Newspaper,
  WRITING_TASK: PenLine,
  ANNOUNCEMENT: Megaphone,
};

const TYPE_LABEL: Record<WhatsNewItemType, string> = {
  TEST: "New Test",
  ARTICLE: "New Article",
  WRITING_TASK: "New Writing Task",
  ANNOUNCEMENT: "Announcement",
};

export function WhatsNewSection({ items }: { items: WhatsNewItem[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-accent size-5" aria-hidden="true" />
        <h2 className="font-display text-xl font-medium tracking-tight">What&apos;s New</h2>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nothing new yet"
          description="New tests, articles, writing tasks and announcements from your teacher will show up here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const Icon = TYPE_ICON[item.type];
            return (
              <Link
                key={item.id}
                href={item.href}
                className="group focus-visible:ring-ring/50 border-accent/20 bg-card relative block rounded-2xl border p-4 shadow-[0_0_0_1px_rgba(120,90,41,0.06),0_12px_28px_-16px_rgba(120,90,41,0.45)] outline-none transition-all duration-[250ms] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(120,90,41,0.12),0_16px_36px_-14px_rgba(120,90,41,0.55)] focus-visible:ring-2"
              >
                <div className="flex items-start gap-3">
                  <span className="bg-secondary text-accent flex size-9 shrink-0 items-center justify-center rounded-xl">
                    <Icon className="size-4.5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-accent text-[11px] font-medium tracking-wide uppercase">{TYPE_LABEL[item.type]}</p>
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.description && (
                      <p className="text-muted-foreground line-clamp-1 text-xs">{item.description}</p>
                    )}
                    <p className="text-muted-foreground/70 text-[11px]">{formatRelativeTime(item.at)}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
