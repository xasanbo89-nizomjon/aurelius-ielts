import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, History, Sparkles } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getVocabularyAiHistory } from "@/lib/ai/vocabulary-assistant";
import { formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata: Metadata = { title: "AI Vocabulary History" };

const ACTION_LABEL = { WORD_INTELLIGENCE: "Viewed word insights", EXPLAIN_WORD: "Explained word" } as const;

export default async function VocabularyAiHistoryPage() {
  const { profile } = await requireStudentProfile();
  const history = await getVocabularyAiHistory(profile.id);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 -mb-2 w-fit">
        <Link href="/student/vocabulary">
          <ArrowLeft className="size-4" /> Back to Vocabulary
        </Link>
      </Button>

      <PageHeader title="AI Learning History" description="Every real AI Vocabulary Assistant request you've made, most recent first." />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
            <Clock className="text-accent size-5" /> Last Viewed Words
          </h2>
          {history.lastViewed.length === 0 ? (
            <EmptyState icon={Clock} title="No words viewed yet" description="Open a word in your notebook to see AI insights here." />
          ) : (
            <Card className="gap-0 py-2">
              <CardContent className="divide-border/70 divide-y px-0">
                {history.lastViewed.map((item) => (
                  <div key={item.word} className="flex items-center justify-between gap-4 px-6 py-3.5">
                    <span className="text-sm font-medium uppercase">{item.word}</span>
                    <span className="text-muted-foreground text-xs">{formatRelativeTime(item.at)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
            <Sparkles className="text-accent size-5" /> Recently Explained Words
          </h2>
          {history.recentlyExplained.length === 0 ? (
            <EmptyState icon={Sparkles} title="No words explained yet" description="Click “Explain Word” on any saved word to see it here." />
          ) : (
            <Card className="gap-0 py-2">
              <CardContent className="divide-border/70 divide-y px-0">
                {history.recentlyExplained.map((item) => (
                  <div key={item.word} className="flex items-center justify-between gap-4 px-6 py-3.5">
                    <span className="text-sm font-medium uppercase">{item.word}</span>
                    <span className="text-muted-foreground text-xs">{formatRelativeTime(item.at)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      </div>

      <section className="space-y-4">
        <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
          <History className="text-accent size-5" /> AI Activity History
        </h2>
        {history.activity.length === 0 ? (
          <EmptyState icon={History} title="No AI activity yet" description="Your AI Vocabulary Assistant requests will show up here." />
        ) : (
          <Card className="gap-0 py-2">
            <CardContent className="divide-border/70 divide-y px-0">
              {history.activity.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 px-6 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {ACTION_LABEL[row.action]}
                      {row.word && <span className="text-muted-foreground"> — {row.word}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={row.cached ? "outline" : "accent"}>{row.cached ? "Cached" : "Generated"}</Badge>
                    <span className="text-muted-foreground text-xs">{formatRelativeTime(row.at)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
