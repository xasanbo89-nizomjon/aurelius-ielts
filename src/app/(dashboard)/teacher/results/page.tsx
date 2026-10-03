import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Gauge, Target, UserCheck, Users, ClipboardCheck, X } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import {
  RESULT_KIND_FILTERS,
  TEACHER_RESULTS_PAGE_SIZE,
  getTeacherResultsOverview,
  listTeacherResults,
  type ResultKindFilter,
} from "@/lib/analytics/teacher-results";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import { ResultsSubNav } from "@/components/teacher/results/results-sub-nav";
import { TeacherResultsTable } from "@/components/teacher/results/teacher-results-table";

export const metadata: Metadata = { title: "Student Results" };

const FILTER_LABELS: Record<ResultKindFilter, string> = {
  all: "All Results",
  reading: "Reading",
  listening: "Listening",
  writing: "Writing",
  "full-mock": "Full Mock",
};

export default async function TeacherResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string; student?: string; page?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { kind: kindParam, q, student: studentParam, page: pageParam } = await searchParams;
  const kind: ResultKindFilter = RESULT_KIND_FILTERS.includes(kindParam as ResultKindFilter) ? (kindParam as ResultKindFilter) : "all";
  const page = Math.max(1, Number(pageParam) || 1);
  const search = q?.trim() || undefined;

  const [overview, list] = await Promise.all([
    getTeacherResultsOverview(profile.id),
    listTeacherResults(profile.id, { kind, search, studentId: studentParam, page }),
  ]);

  const hrefFor = (next: { kind?: ResultKindFilter; page?: number }) => {
    const params = new URLSearchParams();
    const nextKind = next.kind ?? kind;
    if (nextKind !== "all") params.set("kind", nextKind);
    if (search) params.set("q", search);
    if (list.student) params.set("student", list.student.id);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const query = params.toString();
    return query ? `/teacher/results?${query}` : "/teacher/results";
  };

  const totalPages = Math.max(1, Math.ceil(list.total / TEACHER_RESULTS_PAGE_SIZE));
  const filtered = kind !== "all" || Boolean(search) || Boolean(list.student);
  const { completedByKind } = overview;

  return (
    <>
      <PageHeader
        title="Student Results"
        description="Every Reading, Listening, Writing and Full Mock attempt your students have made, with real scores and bands."
      />

      <ResultsSubNav active="results" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Students" value={String(overview.totalStudents)} icon={Users} caption="Assigned to you" />
        <StatCard
          label="Tests Completed"
          value={String(overview.totalTestsCompleted)}
          icon={ClipboardCheck}
          caption={`Reading ${completedByKind.READING} · Listening ${completedByKind.LISTENING} · Writing ${completedByKind.WRITING} · Full Mock ${completedByKind.FULL_MOCK}`}
        />
        <StatCard
          label="Average Band Score"
          value={overview.averageBand != null ? overview.averageBand.toFixed(1) : "—"}
          icon={Gauge}
          caption={overview.averageBand != null ? `Reading, Listening & Writing · ${overview.bandSampleSize} scored` : "No scored tests yet"}
        />
        <StatCard
          label="Average Accuracy"
          value={overview.averageAccuracy != null ? `${overview.averageAccuracy}%` : "—"}
          icon={Target}
          caption={overview.averageAccuracy != null ? `Reading & Listening · ${overview.accuracySampleSize} attempts` : "No completed attempts yet"}
        />
        <StatCard label="Active This Week" value={String(overview.activeStudentsThisWeek)} icon={UserCheck} caption="Students active in the last 7 days" />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter results by type">
          {RESULT_KIND_FILTERS.map((option) => (
            <Link
              key={option}
              href={hrefFor({ kind: option })}
              role="tab"
              aria-selected={kind === option}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                kind === option ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"
              )}
            >
              {FILTER_LABELS[option]}
              <span className={cn("text-xs tabular-nums", kind === option ? "text-primary-foreground/80" : "text-muted-foreground")}>{list.counts[option]}</span>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            name="q"
            placeholder="Search student name, email or test…"
            defaultValue={search}
            hiddenFields={{ ...(kind !== "all" ? { kind } : {}), ...(list.student ? { student: list.student.id } : {}) }}
            className="max-w-sm"
          />
          {list.student && (
            <Link
              href={(() => {
                const params = new URLSearchParams();
                if (kind !== "all") params.set("kind", kind);
                if (search) params.set("q", search);
                const query = params.toString();
                return query ? `/teacher/results?${query}` : "/teacher/results";
              })()}
              className="bg-secondary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm"
            >
              Student: {list.student.name ?? list.student.email} <X className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Show all students</span>
            </Link>
          )}
        </div>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={overview.totalStudents === 0 ? "No students assigned yet" : filtered ? "No matching results" : "No results yet"}
          description={
            overview.totalStudents === 0
              ? "Students assigned to you will appear here once they start taking tests."
              : filtered
                ? "Try a different filter or search."
                : "Results appear here as soon as one of your students starts a test."
          }
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Showing {(page - 1) * TEACHER_RESULTS_PAGE_SIZE + 1}–{(page - 1) * TEACHER_RESULTS_PAGE_SIZE + list.rows.length} of {list.total}
          </p>
          <TeacherResultsTable rows={list.rows} />
          <Pagination page={page} totalPages={totalPages} buildHref={(p) => hrefFor({ page: p })} />
        </>
      )}
    </>
  );
}
