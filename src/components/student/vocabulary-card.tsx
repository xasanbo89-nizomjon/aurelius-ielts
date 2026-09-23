"use client";

import type { VocabularyStatus } from "@prisma/client";

import { VOCABULARY_STATUS_COLORS, VOCABULARY_STATUS_LABELS, VOCABULARY_STATUS_EMOJI } from "@/lib/labels";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type VocabularyCardEntry = {
  id: string;
  status: VocabularyStatus;
  addedAt: Date;
  word: string;
  uzbekTranslation: string | null;
};

export function VocabularyCard({ entry, onClick }: { entry: VocabularyCardEntry; onClick: () => void }) {
  const colors = VOCABULARY_STATUS_COLORS[entry.status];

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "cursor-pointer gap-3 py-5 outline-none transition-shadow hover:shadow-soft-lg focus-visible:ring-ring/50 focus-visible:ring-2",
        "border-l-4",
        colors.border.replace("border-", "border-l-")
      )}
    >
      <CardContent className="space-y-2">
        <p className="font-display truncate text-lg font-semibold tracking-tight uppercase">{entry.word}</p>
        <p className="text-muted-foreground truncate text-sm">
          {entry.uzbekTranslation || <span className="italic">No translation yet</span>}
        </p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Badge variant="outline" className={cn("gap-1.5 border", colors.border, colors.text, colors.bg)}>
            {VOCABULARY_STATUS_EMOJI[entry.status]} {VOCABULARY_STATUS_LABELS[entry.status]}
          </Badge>
          <span className="text-muted-foreground shrink-0 text-xs">{entry.addedAt.toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
