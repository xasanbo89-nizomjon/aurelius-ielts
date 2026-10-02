import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ImageIcon, Layers, Plus, Target, TrendingUp, Upload } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listFullMockTestsForTeacher } from "@/lib/full-mock-tests";
import { getQuestionNumberCounts } from "@/lib/exam/question-counts";
import { getFullMockTeacherOverviewAnalytics } from "@/lib/analytics/full-mock-analytics";
import { MOCK_TEST_DIFFICULTY_BADGE_VARIANT, MOCK_TEST_DIFFICULTY_LABELS } from "@/lib/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import { TestRowActions } from "@/components/teacher/test-row-actions";
import { FullMockTestRowActions } from "@/components/teacher/full-mock-test-row-actions";
import { FallbackImage } from "@/components/ui/fallback-image";

export const metadata: Metadata = { title: "Tests" };

const PAGE_SIZE = 10;

export default async function TeacherTestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const where = {
    createdById: profile.id,
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [tests, total, fullMockTests, fullMockOverview] = await Promise.all([
    prisma.mockTest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        type: true,
        category: true,
        isPublished: true,
        isArchived: true,
        coverImagePath: true,
        _count: { select: { results: true } },
        fullMockReadingUses: { select: { fullMockTest: { select: { title: true } } } },
        fullMockListeningUses: { select: { fullMockTest: { select: { title: true } } } },
        packageFullMockTest: { select: { title: true } },
      },
    }),
    prisma.mockTest.count({ where }),
    listFullMockTestsForTeacher(profile.id),
    getFullMockTeacherOverviewAnalytics(profile.id),
  ]);
  // Numbered questions, not rows — the same count the student sees (see getQuestionNumberCounts).
  const questionCounts = await getQuestionNumberCounts(tests.map((t) => t.id));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/teacher/tests?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Tests"
        description="Reading and listening mock tests you've authored."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput name="q" placeholder="Search tests…" defaultValue={q} />
            <Button asChild variant="outline">
              <Link href="/teacher/tests/import">
                <Upload className="size-4" /> Import PDF Test
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/teacher/tests/full-mock/quick">
                <Upload className="size-4" /> Build Full Mock from Files
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/teacher/tests/full-mock/new">
                <Layers className="size-4" /> Create Full Mock Test
              </Link>
            </Button>
            <Button asChild>
              <Link href="/teacher/tests/new">
                <Plus className="size-4" /> Create test
              </Link>
            </Button>
          </div>
        }
      />

      {tests.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={q ? "No matching tests" : "No tests created yet"}
          description={
            q
              ? `No tests found for "${q}". Try a different search.`
              : "Build your first reading or listening test to make it available to students."
          }
          action={
            !q ? (
              <Button asChild>
                <Link href="/teacher/tests/new">
                  <Plus className="size-4" /> Create your first test
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map((test) => (
                <TableRow key={test.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/teacher/tests/${test.id}`}
                      className="hover:text-accent focus-visible:text-accent flex items-center gap-2.5 underline-offset-4 outline-none focus-visible:underline"
                    >
                      <span className="bg-secondary relative size-8 shrink-0 overflow-hidden rounded-md">
                        {test.coverImagePath ? (
                          <FallbackImage src={test.coverImagePath} alt="" fill sizes="32px" className="object-cover" unoptimized />
                        ) : (
                          <ImageIcon className="text-muted-foreground absolute inset-0 m-auto size-4" strokeWidth={1.5} />
                        )}
                      </span>
                      {test.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    <span className="flex items-center gap-1.5">
                      {test.type.toLowerCase()}
                      {test.category === "CAMBRIDGE" && <Badge variant="success">Cambridge</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>{questionCounts.get(test.id) ?? 0}</TableCell>
                  <TableCell>{test._count.results}</TableCell>
                  <TableCell>
                    <Badge variant={test.isArchived ? "outline" : test.isPublished ? "success" : "outline"}>
                      {test.isArchived ? "Archived" : test.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <TestRowActions
                      testId={test.id}
                      isPublished={test.isPublished}
                      isArchived={test.isArchived}
                      attemptCount={test._count.results}
                      ownerMockTitle={test.packageFullMockTest?.title ?? null}
                      usedInFullMocks={[...new Set([...test.fullMockReadingUses, ...test.fullMockListeningUses].map((use) => use.fullMockTest.title))]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}

      <div className="space-y-3">
        <h2 className="font-display text-lg font-medium">Full Mock Tests</h2>

        {fullMockOverview.totalAttempts > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="py-3.5">
              <CardContent className="space-y-0.5 px-4 text-center">
                <p className="text-muted-foreground text-[11px] font-medium">Most attempted</p>
                <p className="truncate text-sm font-medium">{fullMockOverview.mostAttemptedExam?.title ?? "—"}</p>
                {fullMockOverview.mostAttemptedExam && (
                  <p className="text-muted-foreground text-xs">{fullMockOverview.mostAttemptedExam.attemptCount} attempts</p>
                )}
              </CardContent>
            </Card>
            <Card className="py-3.5">
              <CardContent className="space-y-0.5 px-4 text-center">
                <p className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] font-medium">
                  <TrendingUp className="size-3.5" /> Highest scoring
                </p>
                <p className="truncate text-sm font-medium">{fullMockOverview.highestScoringExam?.title ?? "—"}</p>
                {fullMockOverview.highestScoringExam && (
                  <p className="text-muted-foreground text-xs">Band {fullMockOverview.highestScoringExam.averageBand.toFixed(1)} avg</p>
                )}
              </CardContent>
            </Card>
            <Card className="py-3.5">
              <CardContent className="space-y-0.5 px-4 text-center">
                <p className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] font-medium">
                  <Target className="size-3.5" /> Average band
                </p>
                <p className="font-display text-lg font-medium">
                  {fullMockOverview.averageBandAcrossAllExams != null ? fullMockOverview.averageBandAcrossAllExams.toFixed(1) : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="py-3.5">
              <CardContent className="space-y-0.5 px-4 text-center">
                <p className="text-muted-foreground text-[11px] font-medium">Completion rate</p>
                <p className="font-display text-lg font-medium">{fullMockOverview.completionRate}%</p>
              </CardContent>
            </Card>
          </div>
        )}

        {fullMockTests.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No full mock tests yet — combine a Reading, Listening, Writing and Speaking section into one timed exam.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fullMockTests.map((test) => (
              <div key={test.id} className="border-border/70 hover:shadow-soft-lg rounded-2xl border p-4 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/teacher/tests/full-mock/${test.id}`}
                    className="hover:text-accent focus-visible:text-accent min-w-0 flex-1 truncate text-sm font-medium underline-offset-4 outline-none focus-visible:underline"
                  >
                    {test.title}
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant={test.status === "PUBLISHED" ? "success" : "outline"}>
                      {test.status === "PUBLISHED" ? "Published" : test.status === "ARCHIVED" ? "Archived" : "Draft"}
                    </Badge>
                    <FullMockTestRowActions fullMockTestId={test.id} status={test.status} attemptCount={test.attemptCount} packageTestCount={test.packageTestCount} />
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
                  {test.category === "CAMBRIDGE" && (
                    <Badge variant="success" className="text-[11px]">
                      Free
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-1.5 text-xs">
                  {test.sectionsFilled}/4 sections filled · {test.attemptCount} attempt{test.attemptCount === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
