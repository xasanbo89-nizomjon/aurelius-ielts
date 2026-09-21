import Link from "next/link";
import { Sparkles } from "lucide-react";

import type { WordOfTheDay as WordOfTheDayData } from "@/lib/ai/vocabulary-assistant";
import { VOCABULARY_STATUS_COLORS, VOCABULARY_STATUS_LABELS } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";

export function WordOfTheDay({ word }: { word: WordOfTheDayData | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="text-accent size-4.5" aria-hidden="true" /> Word of the Day
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!word ? (
          <EmptyState
            icon={Sparkles}
            title="No words saved yet"
            description="Save a word while reading an article to see a Word of the Day here."
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-2xl font-semibold tracking-tight uppercase">{word.word}</p>
              <Badge
                variant="outline"
                className={cn(
                  "gap-1.5 border",
                  VOCABULARY_STATUS_COLORS[word.status].border,
                  VOCABULARY_STATUS_COLORS[word.status].text,
                  VOCABULARY_STATUS_COLORS[word.status].bg
                )}
              >
                {VOCABULARY_STATUS_LABELS[word.status]}
              </Badge>
            </div>

            <p className="text-muted-foreground text-sm">
              {word.translation || <span className="italic">No translation yet</span>}
            </p>

            {word.definition && <p className="text-sm">{word.definition}</p>}

            <Button asChild variant="outline" size="sm">
              <Link href="/student/vocabulary">
                {word.hasAiInsights ? "Review in your notebook" : "Explore this word"}
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
