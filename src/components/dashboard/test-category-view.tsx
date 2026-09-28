import Link from "next/link";
import { BookOpen, Clock, FileQuestion, Headphones } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { getPublishedTestsByCategory } from "@/lib/mock-tests";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export async function TestCategoryView({
  title,
  description,
  icon: Icon,
  free,
  tests,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  free: boolean;
  tests: Awaited<ReturnType<typeof getPublishedTestsByCategory>>;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />

      {tests.length === 0 ? (
        <EmptyState
          icon={Icon}
          title="No tests available yet"
          description="Your teacher hasn't published any tests in this category yet. Check back soon."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tests.map((test) => {
            const TypeIcon = test.type === "LISTENING" ? Headphones : BookOpen;
            return (
              <Link
                key={test.id}
                href={`/student/exam/${test.id}`}
                className="focus-visible:ring-ring/50 block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card className="h-full gap-3 py-4 transition-all hover:-translate-y-0.5 hover:shadow-soft-lg sm:gap-6 sm:py-6">
                  <CardHeader className="gap-1 sm:gap-1.5">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Badge variant="outline" className="flex items-center gap-1 text-[11px] capitalize sm:text-xs">
                        <TypeIcon className="size-3 sm:size-3.5" aria-hidden="true" /> {test.type.toLowerCase()}
                      </Badge>
                      {free && (
                        <Badge variant="success" className="text-[11px] sm:text-xs">
                          Free
                        </Badge>
                      )}
                    </div>
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
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
