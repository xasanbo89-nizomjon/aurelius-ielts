import type { Metadata } from "next";
import Link from "next/link";
import type { MockTestDifficulty, Prisma } from "@prisma/client";
import { FileText, GitBranch, ImageIcon, PenLine, Plus, Target, Trash2, TrendingUp } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { scopeFor } from "@/lib/exam/test-access";
import { listFullMockTestsForTeacher } from "@/lib/full-mock-tests";
import { getQuestionNumberCounts } from "@/lib/exam/question-counts";
import { getFullMockTeacherOverviewAnalytics } from "@/lib/analytics/full-mock-analytics";
import { MOCK_TEST_DIFFICULTY_BADGE_VARIANT, MOCK_TEST_DIFFICULTY_LABELS } from "@/lib/labels";
import { isInternalTestTitle } from "@/lib/test-visibility";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { TestRowActions } from "@/components/teacher/test-row-actions";
import { FullMockTestRowActions } from "@/components/teacher/full-mock-test-row-actions";
import { FallbackImage } from "@/components/ui/fallback-image";

export const metadata: Metadata = { title: "Tests" };

const PAGE_SIZE = 15;

type TypeFilter = "reading" | "listening" | "full-mock";
type StatusFilter = "draft" | "published" | "archived";

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "reading", label: "Reading" },
  { value: "listening", label: "Listening" },
  { value: "full-mock", label: "Full Mock" },
];
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];
const LEVELS = Object.keys(MOCK_TEST_DIFFICULTY_LABELS) as MockTestDifficulty[];

const asOption = <T extends string>(value: string | undefined, options: readonly { value: T }[]): T | undefined => options.find((option) => option.value === value)?.value;

const SELECT_CLASS = "border-input bg-card h-11 rounded-xl border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]";

const statusOf = (test: { isPublished: boolean; isArchived: boolean }): StatusFilter => (test.isArchived ? "archived" : test.isPublished ? "published" : "draft");
const STATUS_LABEL: Record<StatusFilter, string> = { draft: "Draft", published: "Published", archived: "Archived" };
const fullMockStatusOf = (status: string): StatusFilter => (status === "PUBLISHED" ? "published" : status === "ARCHIVED" ? "archived" : "draft");

export default async function TeacherTestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; type?: string; status?: string; level?: string; author?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const type = asOption(params.type, TYPE_OPTIONS);
  const status = asOption(params.status, STATUS_OPTIONS);
  const level = LEVELS.find((value) => value === params.level);
  const isRoot = profile.isRootTeacher;

  // Phase L1 - a Root Teacher sees every author's tests and may narrow the list to one; everybody else only their own (see test-access).
  const authors = isRoot
    ? await prisma.teacherProfile.findMany({
        where: { OR: [{ mockTests: { some: {} } }, { fullMockTests: { some: {} } }] },
        select: { id: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const author = isRoot ? authors.find((a) => a.id === params.author)?.id : undefined;

  const showTests = type !== "full-mock";
  const showFullMocks = type === undefined || type === "full-mock";

  const where: Prisma.MockTestWhereInput = {
    ...scopeFor(profile),
    ...(author ? { createdById: author } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(type === "reading" ? { type: "READING" as const } : type === "listening" ? { type: "LISTENING" as const } : {}),
    ...(level ? { difficulty: level } : {}),
    ...(status === "draft" ? { isPublished: false, isArchived: false } : status === "published" ? { isPublished: true, isArchived: false } : status === "archived" ? { isArchived: true } : {}),
  };

  const [tests, total, allFullMocks, fullMockOverview] = await Promise.all([
    showTests
      ? prisma.mockTest.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            title: true,
            type: true,
            category: true,
            difficulty: true,
            isPublished: true,
            isArchived: true,
            coverImagePath: true,
            createdById: true,
            createdBy: { select: { user: { select: { name: true, email: true } } } },
            versionOf: { select: { id: true, title: true } },
            _count: { select: { results: true, versions: true } },
            fullMockReadingUses: { select: { fullMockTest: { select: { title: true } } } },
            fullMockListeningUses: { select: { fullMockTest: { select: { title: true } } } },
            packageFullMockTest: { select: { title: true } },
          },
        })
      : Promise.resolve([]),
    showTests ? prisma.mockTest.count({ where }) : Promise.resolve(0),
    showFullMocks ? listFullMockTestsForTeacher(profile.id) : Promise.resolve([]),
    getFullMockTeacherOverviewAnalytics(profile.id),
  ]);
  // Numbered questions, not rows - the same count the student sees (see getQuestionNumberCounts).
  const questionCounts = await getQuestionNumberCounts(tests.map((t) => t.id));

  const fullMocks = allFullMocks.filter(
    (mock) =>
      (!q || mock.title.toLowerCase().includes(q.toLowerCase())) &&
      (!status || fullMockStatusOf(mock.status) === status) &&
      (!level || mock.difficulty === level) &&
      (!author || mock.createdById === author)
  );

  // Phase L1 - temporary / scratch tests (title starts with "_"): listed for the Root Teacher to review and delete. Filtered in code - SQL LIKE treats "_" as a wildcard.
  const temporary = isRoot ? await loadTemporaryTests() : { tests: [], fullMocks: [] };

  const filtersActive = Boolean(q || type || status || level || author);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const buildHref = (p: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, type, status, level, author })) if (value) next.set(key, value);
    next.set("page", String(p));
    return `/teacher/tests?${next.toString()}`;
  };
  const authorName = (a: { user: { name: string | null; email: string } }) => a.user.name ?? a.user.email;

  return (
    <>
      <PageHeader
        title="Tests"
        description={isRoot ? "Every Reading, Listening and Full Mock test on the platform." : "The Reading, Listening and Full Mock tests you've authored."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher/writing">
                <PenLine className="size-4" /> Writing tasks
              </Link>
            </Button>
            <Button asChild>
              <Link href="/teacher/tests/new" data-testid="new-test">
                <Plus className="size-4" /> New test
              </Link>
            </Button>
          </div>
        }
      />

      <form method="get" role="search" className="flex flex-wrap items-center gap-2" data-testid="test-filters">
        <input type="search" name="q" defaultValue={q} placeholder="Search tests…" aria-label="Search tests" className={`${SELECT_CLASS} w-full max-w-xs placeholder:text-muted-foreground`} />
        <select name="type" defaultValue={type ?? ""} aria-label="Type" className={SELECT_CLASS}>
          <option value="">All types</option>
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} aria-label="Status" className={SELECT_CLASS}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select name="level" defaultValue={level ?? ""} aria-label="Level" className={SELECT_CLASS}>
          <option value="">All levels</option>
          {LEVELS.map((value) => (
            <option key={value} value={value}>
              {MOCK_TEST_DIFFICULTY_LABELS[value]}
            </option>
          ))}
        </select>
        {isRoot && (
          <select name="author" defaultValue={author ?? ""} aria-label="Author" className={SELECT_CLASS}>
            <option value="">All authors</option>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {authorName(a)}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {filtersActive && (
          <Button asChild variant="ghost">
            <Link href="/teacher/tests">Clear</Link>
          </Button>
        )}
      </form>

      {showTests &&
        (tests.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={filtersActive ? "No matching tests" : "No tests created yet"}
            description={filtersActive ? "No tests match these filters. Try different ones, or clear them." : "Build your first reading or listening test to make it available to students."}
            action={
              !filtersActive ? (
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
                  <TableHead>Level</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Status</TableHead>
                  {isRoot && <TableHead>Author</TableHead>}
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.map((test) => (
                  <TableRow key={test.id} data-testid="test-row">
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
                        <span className="min-w-0">
                          {test.title}
                          {(test.versionOf || test._count.versions > 0) && (
                            <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-[11px] font-normal">
                              <GitBranch className="size-3" />
                              {test.versionOf ? `New version of ${test.versionOf.title}` : null}
                              {test.versionOf && test._count.versions > 0 ? " · " : null}
                              {test._count.versions > 0 ? `${test._count.versions} newer version${test._count.versions === 1 ? "" : "s"}` : null}
                            </span>
                          )}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      <span className="flex items-center gap-1.5">
                        {test.type.toLowerCase()}
                        {test.category === "CAMBRIDGE" && <Badge variant="success">Cambridge</Badge>}
                        {isInternalTestTitle(test.title) && <Badge variant="outline">Temporary</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      {test.difficulty ? <Badge variant={MOCK_TEST_DIFFICULTY_BADGE_VARIANT[test.difficulty]}>{MOCK_TEST_DIFFICULTY_LABELS[test.difficulty]}</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>{questionCounts.get(test.id) ?? 0}</TableCell>
                    <TableCell>{test._count.results}</TableCell>
                    <TableCell>
                      <Badge variant={statusOf(test) === "published" ? "success" : "outline"}>{STATUS_LABEL[statusOf(test)]}</Badge>
                    </TableCell>
                    {isRoot && <TableCell className="text-muted-foreground text-xs">{test.createdBy.user.name ?? test.createdBy.user.email}</TableCell>}
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
            <p className="text-muted-foreground -mt-2 text-xs">
              {total} test{total === 1 ? "" : "s"}
              {filtersActive ? " match" : ""}
            </p>
            <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
          </>
        ))}

      {showFullMocks && (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-medium">Full Mock Tests</h2>

          {!filtersActive && fullMockOverview.totalAttempts > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="py-3.5">
                <CardContent className="space-y-0.5 px-4 text-center">
                  <p className="text-muted-foreground text-[11px] font-medium">Most attempted</p>
                  <p className="truncate text-sm font-medium">{fullMockOverview.mostAttemptedExam?.title ?? "—"}</p>
                  {fullMockOverview.mostAttemptedExam && <p className="text-muted-foreground text-xs">{fullMockOverview.mostAttemptedExam.attemptCount} attempts</p>}
                </CardContent>
              </Card>
              <Card className="py-3.5">
                <CardContent className="space-y-0.5 px-4 text-center">
                  <p className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] font-medium">
                    <TrendingUp className="size-3.5" /> Highest scoring
                  </p>
                  <p className="truncate text-sm font-medium">{fullMockOverview.highestScoringExam?.title ?? "—"}</p>
                  {fullMockOverview.highestScoringExam && <p className="text-muted-foreground text-xs">Band {fullMockOverview.highestScoringExam.averageBand.toFixed(1)} avg</p>}
                </CardContent>
              </Card>
              <Card className="py-3.5">
                <CardContent className="space-y-0.5 px-4 text-center">
                  <p className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] font-medium">
                    <Target className="size-3.5" /> Average band
                  </p>
                  <p className="font-display text-lg font-medium">{fullMockOverview.averageBandAcrossAllExams != null ? fullMockOverview.averageBandAcrossAllExams.toFixed(1) : "—"}</p>
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

          {fullMocks.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {filtersActive ? "No Full Mock tests match these filters." : "No full mock tests yet — combine a Reading, Listening, Writing and Speaking section into one timed exam."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fullMocks.map((test) => (
                <div key={test.id} className="border-border/70 hover:shadow-soft-lg rounded-2xl border p-4 transition-all" data-testid="full-mock-card">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/teacher/tests/full-mock/${test.id}`}
                      className="hover:text-accent focus-visible:text-accent min-w-0 flex-1 truncate text-sm font-medium underline-offset-4 outline-none focus-visible:underline"
                    >
                      {test.title}
                    </Link>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant={test.status === "PUBLISHED" ? "success" : "outline"}>{STATUS_LABEL[fullMockStatusOf(test.status)]}</Badge>
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
                    {isInternalTestTitle(test.title) && (
                      <Badge variant="outline" className="text-[11px]">
                        Temporary
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    {test.sectionsFilled}/4 sections filled · {test.attemptCount} attempt{test.attemptCount === 1 ? "" : "s"}
                    {isRoot ? ` · ${test.authorName}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isRoot && (temporary.tests.length > 0 || temporary.fullMocks.length > 0) && (
        <div className="space-y-3" data-testid="temporary-tests">
          <div>
            <h2 className="font-display flex items-center gap-2 text-lg font-medium">
              <Trash2 className="text-muted-foreground size-4" /> Temporary tests
            </h2>
            <p className="text-muted-foreground text-sm">
              Titles that start with an underscore are scratch tests: students never see them. Review them here and delete the ones that are no longer needed. A test students have attempted asks for a separate confirmation before it is deleted.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {temporary.tests.map((test) => (
                <TableRow key={test.id} data-testid="temporary-row">
                  <TableCell className="font-medium">
                    <Link href={`/teacher/tests/${test.id}`} className="hover:text-accent underline-offset-4 hover:underline">
                      {test.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">{test.type.toLowerCase()}</TableCell>
                  <TableCell>{test._count.results}</TableCell>
                  <TableCell>
                    <Badge variant={statusOf(test) === "published" ? "success" : "outline"}>{STATUS_LABEL[statusOf(test)]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{test.createdBy.user.name ?? test.createdBy.user.email}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{test.createdAt.toISOString().slice(0, 10)}</TableCell>
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
              {temporary.fullMocks.map((mock) => (
                <TableRow key={mock.id} data-testid="temporary-row">
                  <TableCell className="font-medium">
                    <Link href={`/teacher/tests/full-mock/${mock.id}`} className="hover:text-accent underline-offset-4 hover:underline">
                      {mock.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">Full Mock</TableCell>
                  <TableCell>{mock._count.attempts}</TableCell>
                  <TableCell>
                    <Badge variant={mock.status === "PUBLISHED" ? "success" : "outline"}>{STATUS_LABEL[fullMockStatusOf(mock.status)]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{mock.createdBy.user.name ?? mock.createdBy.user.email}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{mock.createdAt.toISOString().slice(0, 10)}</TableCell>
                  <TableCell>
                    <FullMockTestRowActions fullMockTestId={mock.id} status={mock.status} attemptCount={mock._count.attempts} packageTestCount={mock._count.packageTests} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

/** Every scratch test and Full Mock on the platform (Root Teacher only). Two light queries first, because the "_" rule must run in code (see test-visibility). */
async function loadTemporaryTests() {
  const [testTitles, mockTitles] = await Promise.all([
    prisma.mockTest.findMany({ select: { id: true, title: true } }),
    prisma.fullMockTest.findMany({ select: { id: true, title: true } }),
  ]);
  const testIds = testTitles.filter((t) => isInternalTestTitle(t.title)).map((t) => t.id);
  const mockIds = mockTitles.filter((m) => isInternalTestTitle(m.title)).map((m) => m.id);
  const [tests, fullMocks] = await Promise.all([
    testIds.length === 0
      ? Promise.resolve([])
      : prisma.mockTest.findMany({
          where: { id: { in: testIds } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            type: true,
            isPublished: true,
            isArchived: true,
            createdAt: true,
            createdBy: { select: { user: { select: { name: true, email: true } } } },
            _count: { select: { results: true } },
            fullMockReadingUses: { select: { fullMockTest: { select: { title: true } } } },
            fullMockListeningUses: { select: { fullMockTest: { select: { title: true } } } },
            packageFullMockTest: { select: { title: true } },
          },
        }),
    mockIds.length === 0
      ? Promise.resolve([])
      : prisma.fullMockTest.findMany({
          where: { id: { in: mockIds } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            createdBy: { select: { user: { select: { name: true, email: true } } } },
            _count: { select: { attempts: true, packageTests: true } },
          },
        }),
  ]);
  return { tests, fullMocks };
}
