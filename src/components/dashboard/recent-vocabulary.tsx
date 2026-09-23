import Link from "next/link";
import { BookMarked } from "lucide-react";

import { formatRelativeTime } from "@/lib/format";
import { VOCABULARY_STATUS_LABELS, VOCABULARY_STATUS_EMOJI } from "@/lib/labels";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export function RecentVocabulary({ words }: { words: { word: string; lastReviewedAt: Date }[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-medium tracking-tight">Recently Learned Words</h2>
        <Link href="/student/vocabulary" className="text-accent text-xs font-medium hover:underline">
          View all
        </Link>
      </div>

      {words.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No words viewed yet"
          description={`Click any word while reading an article and it's automatically saved here as ${VOCABULARY_STATUS_EMOJI.KNOWN} ${VOCABULARY_STATUS_LABELS.KNOWN}.`}
        />
      ) : (
        <Card className="gap-0 py-2">
          <CardContent className="divide-border/70 divide-y px-0">
            {words.map((entry) => (
              <div key={entry.word} className="flex items-center justify-between gap-4 px-6 py-3.5">
                <span className="text-sm font-medium">{entry.word}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="accent">{VOCABULARY_STATUS_LABELS.KNOWN}</Badge>
                  <span className="text-muted-foreground text-xs">{formatRelativeTime(entry.lastReviewedAt)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
