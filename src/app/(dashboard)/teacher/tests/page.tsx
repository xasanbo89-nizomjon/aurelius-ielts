import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import { TestRowActions } from "@/components/teacher/test-row-actions";

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

  const [tests, total] = await Promise.all([
    prisma.mockTest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { questions: true, results: true } } },
    }),
    prisma.mockTest.count({ where }),
  ]);

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
          <div className="flex items-center gap-2">
            <SearchInput name="q" placeholder="Search tests…" defaultValue={q} />
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
                      className="hover:text-accent focus-visible:text-accent underline-offset-4 outline-none focus-visible:underline"
                    >
                      {test.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">{test.type.toLowerCase()}</TableCell>
                  <TableCell>{test._count.questions}</TableCell>
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
                      hasResults={test._count.results > 0}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </>
  );
}
