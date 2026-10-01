import Link from "next/link";
import { Clock, FileQuestion } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MockTestDifficulty } from "@prisma/client";

import type { GeneralTestRow } from "@/lib/mock-tests";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FilterPills, type FilterPillOption } from "@/components/dashboard/filter-pills";
import { SearchInput } from "@/components/ui/search-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FallbackImage } from "@/components/ui/fallback-image";

const DIFFICULTY_LABEL: Record<MockTestDifficulty, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

const DIFFICULTY_BADGE_VARIANT: Record<MockTestDifficulty, "success" | "accent" | "destructive"> = {
  BEGINNER: "success",
  INTERMEDIATE: "accent",
  ADVANCED: "destructive",
};

const DIFFICULTY_OPTIONS: MockTestDifficulty[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

/**
 * Phase 34 — Part 2/3. Shared list view for the dedicated Reading Tests and
 * Listening Tests pages: real search + real difficulty filter (both plain
 * GET-form navigation, zero client JS), difficulty badge, duration, question
 * count, Start Test button.
 */
export function GeneralTestListView({
  title,
  description,
  icon: Icon,
  basePath,
  examBasePath,
  tests,
  search,
  difficulty,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  basePath: string;
  examBasePath: string;
  tests: GeneralTestRow[];
  search?: string;
  difficulty?: MockTestDifficulty;
}) {
  const buildHref = (nextDifficulty?: MockTestDifficulty) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (nextDifficulty) params.set("difficulty", nextDifficulty);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const filterOptions: FilterPillOption[] = [
    { value: "ALL", label: "All levels", href: buildHref() },
    ...DIFFICULTY_OPTIONS.map((value) => ({
      value,
      label: DIFFICULTY_LABEL[value],
      href: buildHref(value),
    })),
  ];

  const hasFilters = Boolean(search || difficulty);

  return (
    <>
      <PageHeader title={title} description={description} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterPills options={filterOptions} activeValue={difficulty ?? "ALL"} label="Filter by difficulty" />
        <SearchInput
          name="q"
          placeholder="Search tests…"
          defaultValue={search}
          action={basePath}
          hiddenFields={difficulty ? { difficulty } : undefined}
        />
      </div>

      {tests.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={hasFilters ? "No matching tests" : "No tests available yet"}
          description={
            hasFilters
              ? "No tests match your search or filter. Try adjusting them."
              : "Your teacher hasn't published any tests in this category yet. Check back soon."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tests.map((test) => (
            <Link
              key={test.id}
              href={`${examBasePath}/${test.id}`}
              className="focus-visible:ring-ring/50 block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Card className="h-full gap-3 overflow-hidden py-4 transition-all hover:-translate-y-0.5 hover:shadow-soft-lg sm:gap-6 sm:py-6">
                {test.coverImagePath && (
                  <div className="bg-secondary relative -mx-4 -mt-4 aspect-video sm:-mx-6 sm:-mt-6">
                    <FallbackImage src={test.coverImagePath} alt="" fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" unoptimized />
                  </div>
                )}
                <CardHeader className="gap-1 sm:gap-1.5">
                  {test.difficulty && (
                    <Badge variant={DIFFICULTY_BADGE_VARIANT[test.difficulty]} className="w-fit text-[11px] sm:text-xs">
                      {DIFFICULTY_LABEL[test.difficulty]}
                    </Badge>
                  )}
                  <CardTitle className="line-clamp-1 text-base sm:line-clamp-none sm:text-lg">{test.title}</CardTitle>
                  {test.description && (
                    <CardDescription className="line-clamp-1 text-xs sm:line-clamp-none sm:text-sm">{test.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="text-muted-foreground flex items-center gap-3 text-[11px] sm:gap-4 sm:text-xs">
                  <span className="flex items-center gap-1">
                    <FileQuestion className="size-3 sm:size-3.5" aria-hidden="true" />
                    {test.questionCount} question{test.questionCount === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3 sm:size-3.5" aria-hidden="true" />
                    {test.durationMinutes ? `${test.durationMinutes} min` : "Untimed"}
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
