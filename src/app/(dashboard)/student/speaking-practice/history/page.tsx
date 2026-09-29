import type { Metadata } from "next";
import Link from "next/link";
import { History, Mic } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getSpeakingPracticeStats, listSpeakingAttemptsForStudent } from "@/lib/speaking-practice";
import { formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Speaking Practice History" };

const PART_LABEL: Record<"PART_1" | "PART_2" | "PART_3", string> = {
  PART_1: "Part 1",
  PART_2: "Part 2",
  PART_3: "Part 3",
};

export default async function SpeakingPracticeHistoryPage() {
  const { profile } = await requireStudentProfile();

  const [attempts, stats] = await Promise.all([
    listSpeakingAttemptsForStudent(profile.id),
    getSpeakingPracticeStats(profile.id),
  ]);

  return (
    <>
      <PageHeader title="Speaking Practice History" description="Every past practice attempt and its AI feedback." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Practice Count" value={String(stats.practiceCount)} icon={History} />
        <StatCard label="Average Band" value={stats.averageBand?.toFixed(1) ?? "—"} icon={Mic} />
        <StatCard label="Best Band" value={stats.bestBand?.toFixed(1) ?? "—"} icon={Mic} />
        <StatCard
          label="Weakest Skill"
          value={stats.weakestSkill ? `${stats.weakestSkill.label} (${stats.weakestSkill.band.toFixed(1)})` : "—"}
          icon={Mic}
          valueClassName="text-lg sm:text-2xl"
        />
      </div>

      {attempts.length === 0 ? (
        <EmptyState
          icon={Mic}
          title="No practice attempts yet"
          description="Head to Speaking Practice and submit your first answer to see it here."
        />
      ) : (
        <div className="space-y-2">
          {attempts.map((attempt) => (
            <Link key={attempt.id} href={`/student/speaking-practice/attempt/${attempt.id}/results`} className="block">
              <Card className="py-3.5 transition-colors hover:bg-secondary/40">
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[11px]">
                        {PART_LABEL[attempt.part]}
                      </Badge>
                      <p className="truncate text-sm font-medium">{attempt.promptTitle}</p>
                    </div>
                    <p className="text-muted-foreground/70 text-xs">{formatRelativeTime(attempt.submittedAt)}</p>
                  </div>
                  <span className="font-display shrink-0 text-lg font-medium">
                    {attempt.overallBand != null ? attempt.overallBand.toFixed(1) : "—"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
