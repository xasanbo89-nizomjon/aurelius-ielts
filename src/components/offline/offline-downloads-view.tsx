"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { listDownloads, type OfflineDownload } from "@/lib/offline/db";
import type { VocabularyDownloadWord, BookmarksDownload, StudyPlanDownload } from "@/actions/offline-downloads.actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

function VocabularyView({ data }: { data: VocabularyDownloadWord[] }) {
  if (data.length === 0) return <p className="text-muted-foreground text-sm">No saved words yet.</p>;
  return (
    <ul className="space-y-2">
      {data.map((word, index) => (
        <li key={index} className="bg-secondary/50 rounded-lg px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{word.word}</span>
            <Badge variant="outline">{word.status}</Badge>
          </div>
          {word.uzbekTranslation && <p className="text-muted-foreground text-xs">{word.uzbekTranslation}</p>}
          {word.englishDefinition && <p className="text-muted-foreground text-xs">{word.englishDefinition}</p>}
        </li>
      ))}
    </ul>
  );
}

function BookmarksView({ data }: { data: BookmarksDownload }) {
  if (data.questions.length === 0 && data.writingTasks.length === 0) {
    return <p className="text-muted-foreground text-sm">No bookmarks yet.</p>;
  }
  return (
    <div className="space-y-4">
      {data.questions.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Questions</p>
          {data.questions.map((q, index) => (
            <div key={index} className="bg-secondary/50 rounded-lg px-3 py-2 text-sm">
              <p>{q.prompt}</p>
              <p className="text-muted-foreground text-xs">
                {q.skill} · {q.testTitle}
              </p>
            </div>
          ))}
        </div>
      )}
      {data.writingTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Writing Tasks</p>
          {data.writingTasks.map((t, index) => (
            <div key={index} className="bg-secondary/50 rounded-lg px-3 py-2 text-sm">
              <p>{t.title}</p>
              <p className="text-muted-foreground text-xs">{t.taskNumber}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudyPlanView({ data }: { data: StudyPlanDownload }) {
  if (!data) return <p className="text-muted-foreground text-sm">No study plan generated yet.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed">{data.summary}</p>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Weekly Plan</p>
        {data.weeklyPlan.map((day) => (
          <div key={day.day} className="bg-secondary/50 rounded-lg px-3 py-2 text-sm">
            <p className="font-medium">
              Day {day.day} — {day.focus}
            </p>
            <ul className="text-muted-foreground mt-1 list-inside list-disc text-xs">
              {day.tasks.map((task, i) => (
                <li key={i}>{task}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Roadmap</p>
        {data.roadmap.map((milestone, index) => (
          <div key={index} className="bg-secondary/50 rounded-lg px-3 py-2 text-sm">
            <p className="font-medium">{milestone.title}</p>
            <p className="text-muted-foreground text-xs">{milestone.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OfflineDownloadsView() {
  const [downloads, setDownloads] = useState<OfflineDownload[] | null>(null);

  useEffect(() => {
    listDownloads()
      .then(setDownloads)
      .catch(() => setDownloads([]));
  }, []);

  if (downloads === null) return <p className="text-muted-foreground text-sm">Loading…</p>;

  if (downloads.length === 0) {
    return (
      <EmptyState
        icon={Download}
        title="Nothing downloaded yet"
        description="Open Downloads while online and save your vocabulary, bookmarks or study plan to view them here offline."
      />
    );
  }

  return (
    <div className="space-y-6">
      {downloads.map((download) => (
        <Card key={download.key}>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{download.label}</p>
              <span className="text-muted-foreground text-xs">Saved {new Date(download.savedAt).toLocaleDateString()}</span>
            </div>
            {download.key === "vocabulary" && <VocabularyView data={download.data as VocabularyDownloadWord[]} />}
            {download.key === "bookmarks" && <BookmarksView data={download.data as BookmarksDownload} />}
            {download.key === "studyPlan" && <StudyPlanView data={download.data as StudyPlanDownload} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
