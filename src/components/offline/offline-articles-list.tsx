"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Trash2 } from "lucide-react";

import { listOfflineArticles, deleteOfflineArticle, type OfflineArticle } from "@/lib/offline/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";

export function OfflineArticlesList() {
  const [articles, setArticles] = useState<OfflineArticle[] | null>(null);

  useEffect(() => {
    listOfflineArticles()
      .then(setArticles)
      .catch(() => setArticles([]));
  }, []);

  async function handleRemove(id: string) {
    await deleteOfflineArticle(id).catch(() => {});
    setArticles((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
  }

  if (articles === null) {
    return <p className="text-muted-foreground text-sm">Loading your saved articles…</p>;
  }

  if (articles.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No articles saved for offline yet"
        description="Open an article while online and tap “Save for Offline” to read it here without a connection."
      />
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((article) => (
        <Card key={article.id}>
          <CardContent className="flex items-center justify-between gap-3">
            <Link href={`/offline/articles/${article.id}`} className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{article.category}</Badge>
                <Badge variant="outline">{article.difficulty}</Badge>
              </div>
              <p className="truncate text-sm font-medium">{article.title}</p>
              <p className="text-muted-foreground text-xs">
                {article.readingMinutes} min read · Saved {new Date(article.savedAt).toLocaleDateString()}
              </p>
            </Link>
            <Button variant="ghost" size="icon" aria-label="Remove from offline" onClick={() => handleRemove(article.id)}>
              <Trash2 className="text-muted-foreground size-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
