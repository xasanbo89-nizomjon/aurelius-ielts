import { Megaphone } from "lucide-react";

import type { getLatestPublishedUpdates } from "@/lib/updates";
import { formatRelativeTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";

type UpdateItem = Awaited<ReturnType<typeof getLatestPublishedUpdates>>[number];

/**
 * The public landing page's announcement feed — visible to guests,
 * students and teachers alike, so it's never scoped to one teacher (unlike
 * the old per-teacher dashboard version this replaces). Server-rendered
 * with the rest of the marketing page for SEO, no client fetch.
 */
export function WhatsNew({ updates }: { updates: UpdateItem[] }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
      <div className="mx-auto max-w-3xl space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">What&apos;s New</h2>

        {updates.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No updates available"
            description="Check back later for news from your teacher."
          />
        ) : (
          <Card className="gap-0 py-2">
            <CardContent className="divide-border/70 divide-y px-0">
              {updates.map((update) => (
                <div key={update.id} className="space-y-1 px-6 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{update.title}</p>
                    {update.publishedAt && (
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatRelativeTime(update.publishedAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm whitespace-pre-wrap">{update.content}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
