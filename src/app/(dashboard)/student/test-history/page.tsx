import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import type { SkillType } from "@prisma/client";

import { requireStudentProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { FilterPills } from "@/components/dashboard/filter-pills";

export const metadata: Metadata = { title: "Test History" };

const PAGE_SIZE = 10;

const FILTERS = [
  { value: "all", label: "All" },
  { value: "reading", label: "Reading" },
  { value: "listening", label: "Listening" },
] as const;

export default async function TestHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; q?: string; page?: string }>;
}) {
  const { profile } = await requireStudentProfile();
  const { module: moduleFilter, q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const skill: SkillType | undefined =
    moduleFilter === "reading" ? "READING" : moduleFilter === "listening" ? "LISTENING" : undefined;

  const where = {
    studentId: profile.id,
    completedAt: { not: null } as const,
    ...(skill ? { skill } : {}),
    ...(q ? { mockTest: { title: { contains: q, mode: "insensitive" as const } } } : {}),
  };

  const [results, total] = await Promise.all([
    prisma.result.findMany({
      where,
      orderBy: { completedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { mockTest: { select: { title: true, type: true } } },
    }),
    prisma.result.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (moduleFilter) params.set("module", moduleFilter);
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/student/test-history?${params.toString()}`;
  };
  const filterHref = (moduleValue: string) => {
    const params = new URLSearchParams();
    if (moduleValue !== "all") params.set("module", moduleValue);
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `/student/test-history?${query}` : "/student/test-history";
  };

  return (
    <>
      <PageHeader
        title="Test History"
        description="Every test you've completed, with your score and estimated band."
        actions={
          <SearchInput
            name="q"
            placeholder="Search tests…"
            defaultValue={q}
            hiddenFields={moduleFilter ? { module: moduleFilter } : undefined}
          />
        }
      />

      <FilterPills
        label="Filter by module"
        activeValue={moduleFilter ?? "all"}
        options={FILTERS.map((filter) => ({
          value: filter.value,
          label: filter.label,
          href: filterHref(filter.value),
        }))}
      />

      {results.length === 0 ? (
        <EmptyState
          icon={History}
          title={q ? "No matching tests" : "No completed tests yet"}
          description={
            q
              ? `No completed tests found for "${q}". Try a different search.`
              : "Once you finish a reading or listening test, it'll show up here."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Band</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => (
                <TableRow key={result.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/student/exam/attempt/${result.id}/results`}
                      className="hover:text-accent focus-visible:text-accent underline-offset-4 outline-none focus-visible:underline"
                    >
                      {result.mockTest.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">{result.mockTest.type.toLowerCase()}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {result.completedAt?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </TableCell>
                  <TableCell>{result.rawScore ?? 0}</TableCell>
                  <TableCell>
                    {result.bandScore != null ? (
                      <Badge variant="accent">{result.bandScore.toFixed(1)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {result.durationSeconds != null ? `${Math.round(result.durationSeconds / 60)} min` : "—"}
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
