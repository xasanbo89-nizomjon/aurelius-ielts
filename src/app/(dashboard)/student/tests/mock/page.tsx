import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ClipboardCheck, Clock, Gauge, Headphones, Mic, PenLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { getPublishedFullMockTests } from "@/lib/full-mock-tests";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Full Mock Tests" };

const SECTION_ICONS: { key: "listening" | "reading" | "writing" | "speaking"; label: string; icon: LucideIcon }[] = [
  { key: "listening", label: "Listening", icon: Headphones },
  { key: "reading", label: "Reading", icon: BookOpen },
  { key: "writing", label: "Writing", icon: PenLine },
  { key: "speaking", label: "Speaking", icon: Mic },
];

export default async function FullMockTestsPage() {
  const tests = await getPublishedFullMockTests();

  return (
    <>
      <PageHeader title="Full Mock Tests" description="Sit all four sections back-to-back under real exam timing." />

      {tests.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No full mock tests available yet"
          description="Your teacher hasn't published a full mock exam yet. Check back soon."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tests.map((test) => (
            <Card key={test.id} className="h-full gap-3 py-4 sm:gap-6 sm:py-6">
              <CardHeader className="gap-1 sm:gap-1.5">
                <CardTitle className="line-clamp-1 text-base sm:line-clamp-none sm:text-lg">{test.title}</CardTitle>
                {test.description && (
                  <CardDescription className="line-clamp-2 text-xs sm:text-sm">{test.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {SECTION_ICONS.map(({ key, label, icon: Icon }) => (
                    <Badge key={key} variant={test.sections[key] ? "accent" : "outline"} className="flex items-center gap-1 text-[11px]">
                      <Icon className="size-3" aria-hidden="true" /> {label}
                    </Badge>
                  ))}
                </div>

                <div className="text-muted-foreground flex items-center gap-3 text-[11px] sm:text-xs">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3 sm:size-3.5" aria-hidden="true" />
                    ~{test.totalDurationMinutes} min total
                  </span>
                  {test.estimatedBandMin != null && test.estimatedBandMax != null && (
                    <span className="flex items-center gap-1">
                      <Gauge className="size-3 sm:size-3.5" aria-hidden="true" />
                      Band {test.estimatedBandMin.toFixed(1)}–{test.estimatedBandMax.toFixed(1)}
                    </span>
                  )}
                </div>

                <Button asChild className="w-full">
                  <Link href={`/student/full-mock/${test.id}`}>Start Full Mock</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
