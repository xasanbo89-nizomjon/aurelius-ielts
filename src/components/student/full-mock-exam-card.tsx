import Link from "next/link";
import { BookOpen, CheckCircle2, Clock, Gauge, Headphones, Lock, Mic, PenLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { MOCK_TEST_DIFFICULTY_BADGE_VARIANT, MOCK_TEST_DIFFICULTY_LABELS } from "@/lib/labels";
import type { FullMockCardData } from "@/lib/full-mock-dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SECTION_ICONS: { key: "listening" | "reading" | "writing" | "speaking"; label: string; icon: LucideIcon }[] = [
  { key: "listening", label: "Listening", icon: Headphones },
  { key: "reading", label: "Reading", icon: BookOpen },
  { key: "writing", label: "Writing", icon: PenLine },
  { key: "speaking", label: "Speaking", icon: Mic },
];

export type FullMockCardStatus = "available" | "inProgress" | "completed" | "locked";

/** Phase 47 — the Mock Exam Center card: Exam Name, Exam Number, Estimated Band, Duration, Difficulty, Premium Badge — every value real, passed straight from getStudentFullMockDashboard. */
export function FullMockExamCard({ test, status }: { test: FullMockCardData; status: FullMockCardStatus }) {
  const ctaLabel =
    status === "inProgress" ? "Resume Full Mock" : status === "locked" ? "Upgrade to unlock" : "Start Full Mock";
  const ctaHref = status === "locked" ? "/student/premium?upgrade=1" : `/student/full-mock/${test.id}`;

  return (
    <Card className="h-full gap-3 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="gap-1 sm:gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {test.examNumber != null && (
            <Badge variant="outline" className="text-[11px]">
              Mock #{test.examNumber}
            </Badge>
          )}
          {test.difficulty && (
            <Badge variant={MOCK_TEST_DIFFICULTY_BADGE_VARIANT[test.difficulty]} className="text-[11px]">
              {MOCK_TEST_DIFFICULTY_LABELS[test.difficulty]}
            </Badge>
          )}
          {test.category === "GENERAL" && (
            <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent flex items-center gap-1 text-[11px]">
              <Lock className="size-3" aria-hidden="true" /> Premium
            </Badge>
          )}
        </div>
        <CardTitle className="line-clamp-1 text-base sm:line-clamp-none sm:text-lg">{test.title}</CardTitle>
        {test.description && <CardDescription className="line-clamp-2 text-xs sm:text-sm">{test.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {SECTION_ICONS.map(({ key, label, icon: Icon }) => (
            <Badge key={key} variant={test.sections[key] ? "accent" : "outline"} className="flex items-center gap-1 text-[11px]">
              <Icon className="size-3" aria-hidden="true" /> {label}
            </Badge>
          ))}
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-[11px] sm:text-xs">
          <span className="flex items-center gap-1">
            <Clock className="size-3 sm:size-3.5" aria-hidden="true" />
            ~{test.totalDurationMinutes} min total
          </span>
          {status !== "completed" && test.estimatedBandMin != null && test.estimatedBandMax != null && (
            <span className="flex items-center gap-1">
              <Gauge className="size-3 sm:size-3.5" aria-hidden="true" />
              Band {test.estimatedBandMin.toFixed(1)}–{test.estimatedBandMax.toFixed(1)}
            </span>
          )}
        </div>

        {status === "completed" ? (
          // Phase O - a finished Full Mock shows no band to the student: only that it was handed in.
          <div className="space-y-1 text-center" data-testid="full-mock-submitted">
            <Badge variant="success" className="mx-auto flex w-fit items-center gap-1">
              <CheckCircle2 className="size-3" aria-hidden="true" /> Submitted
            </Badge>
            <p className="text-muted-foreground text-xs">Your teacher will share your result with you.</p>
          </div>
        ) : (
          <Button asChild className="w-full" variant={status === "locked" ? "outline" : "default"}>
            <Link href={ctaHref}>{ctaLabel}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
