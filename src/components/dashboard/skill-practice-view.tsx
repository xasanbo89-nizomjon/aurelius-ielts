import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { TestType } from "@prisma/client";
import { Clock, FileQuestion } from "lucide-react";

import { cn } from "@/lib/utils";
import { getPublishedTests } from "@/lib/mock-tests";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SIMULATABLE_TYPES: TestType[] = ["READING", "LISTENING"];

export async function SkillPracticeView({
  type,
  title,
  description,
  icon: Icon,
}: {
  type: TestType;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  const tests = await getPublishedTests(type);
  const isSimulatable = SIMULATABLE_TYPES.includes(type);

  return (
    <>
      <PageHeader title={title} description={description} />

      {tests.length === 0 ? (
        <EmptyState
          icon={Icon}
          title="No tests available yet"
          description="Your teacher hasn't published any tests for this skill yet. Check back soon."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tests.map((test) => {
            const card = (
              <Card
                className={cn(
                  "h-full gap-3 py-4 sm:gap-6 sm:py-6",
                  isSimulatable && "transition-all hover:-translate-y-0.5 hover:shadow-soft-lg"
                )}
              >
                <CardHeader className="gap-1 sm:gap-1.5">
                  <CardTitle className="line-clamp-1 text-base sm:line-clamp-none sm:text-lg">{test.title}</CardTitle>
                  {test.description && (
                    <CardDescription className="line-clamp-1 text-xs sm:line-clamp-none sm:text-sm">{test.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="text-muted-foreground flex items-center gap-3 text-[11px] sm:gap-4 sm:text-xs">
                  <span className="flex items-center gap-1">
                    <FileQuestion className="size-3 sm:size-3.5" aria-hidden="true" />
                    {test._count.questions} question{test._count.questions === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3 sm:size-3.5" aria-hidden="true" />
                    {test.durationMinutes ? `${test.durationMinutes} min` : "Untimed"}
                  </span>
                </CardContent>
              </Card>
            );

            return isSimulatable ? (
              <Link
                key={test.id}
                href={`/student/exam/${test.id}`}
                className="focus-visible:ring-ring/50 block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {card}
              </Link>
            ) : (
              <div key={test.id}>{card}</div>
            );
          })}
        </div>
      )}
    </>
  );
}
