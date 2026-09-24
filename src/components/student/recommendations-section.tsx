import Link from "next/link";
import { BookOpen, Headphones, Newspaper, PenLine } from "lucide-react";

import type { StudentRecommendations } from "@/lib/analytics/recommendations";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export function RecommendationsSection({ recommendations }: { recommendations: StudentRecommendations }) {
  const { articles, tests, tasks, basedOn } = recommendations;
  const isEmpty = articles.length === 0 && tests.length === 0 && tasks.length === 0;

  return (
    <div className="space-y-4">
      {basedOn.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Based on: {basedOn.slice(0, 3).join(", ")}
          {basedOn.length > 3 ? `, +${basedOn.length - 3} more` : ""}
        </p>
      )}

      {isEmpty ? (
        <EmptyState
          icon={Newspaper}
          title="Nothing new to recommend right now"
          description="You're either caught up on everything available, or we don't have enough data on your weak areas yet."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {tests.length > 0 && (
            <Card>
              <CardContent className="space-y-2.5">
                <p className="text-sm font-medium">Recommended Tests</p>
                {tests.map((test) => (
                  <Link key={test.id} href={`/student/exam/${test.id}`} className="block">
                    <div className="border-border/70 hover:bg-secondary/40 flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors">
                      {test.type === "LISTENING" ? <Headphones className="text-accent size-4 shrink-0" /> : <BookOpen className="text-accent size-4 shrink-0" />}
                      <span className="min-w-0 flex-1 truncate text-sm">{test.title}</span>
                      {test.isFree && <Badge variant="success" className="shrink-0">Free</Badge>}
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {articles.length > 0 && (
            <Card>
              <CardContent className="space-y-2.5">
                <p className="text-sm font-medium">Recommended Articles</p>
                {articles.map((article) => (
                  <Link key={article.id} href={`/student/articles/${article.id}`} className="block">
                    <div className="border-border/70 hover:bg-secondary/40 flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors">
                      <Newspaper className="text-accent size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm">{article.title}</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {tasks.length > 0 && (
            <Card>
              <CardContent className="space-y-2.5">
                <p className="text-sm font-medium">Recommended Tasks</p>
                {tasks.map((task) => (
                  <Link key={task.id} href={`/student/writing/new?taskId=${task.id}`} className="block">
                    <div className="border-border/70 hover:bg-secondary/40 flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors">
                      <PenLine className="text-accent size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
