import type { Metadata } from "next";
import Link from "next/link";

import { requireTeacherProfile } from "@/lib/session";
import { studentScope } from "@/lib/exam/test-access";
import { getBandDistribution, getFilterOptions, getQuestionAnalysis, getResultsOverview, getStudentRows, mostMissed, type AttemptFilter } from "@/lib/analytics/results-analysis";
import { PageHeader } from "@/components/dashboard/page-header";
import { AnalyticsSubNav } from "@/components/teacher/analytics-sub-nav";
import { ResultsAnalysisView } from "@/components/analytics/results-analysis-view";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Results analysis" };

type Search = { test?: string; student?: string; skill?: string; from?: string; to?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A "YYYY-MM-DD" from the form as the start of that day (UTC), or undefined. */
function dayStart(value: string | undefined): Date | undefined {
  if (!value || !DAY.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Phase M - results analysis for a teacher (their own students) or a Root Teacher (every student): one page, filters for the test, the student, the module and
 * a date range. Every number comes from the attempts' stored marks; an empty selection says so instead of showing zeros.
 */
export default async function TeacherResultsAnalysisPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { profile } = await requireTeacherProfile();
  const query = await searchParams;
  const scope = studentScope(profile);

  const options = await getFilterOptions(scope);
  const test = options.tests.find((candidate) => candidate.id === query.test)?.id;
  const student = options.students.find((candidate) => candidate.id === query.student)?.id;
  const skill = query.skill === "READING" || query.skill === "LISTENING" ? query.skill : undefined;
  const from = dayStart(query.from);
  const toStart = dayStart(query.to);
  // the "to" day is included: up to the start of the next day
  const to = toStart ? new Date(toStart.getTime() + 24 * 3600 * 1000) : undefined;

  const filter: AttemptFilter = { ...scope, testId: test, studentId: student, skill, from, to };
  const [overview, bands, analysis, students] = await Promise.all([getResultsOverview(filter), getBandDistribution(filter), getQuestionAnalysis(filter), getStudentRows(filter)]);
  const filtered = Boolean(test || student || skill || from || to);

  return (
    <>
      <PageHeader
        title="Results analysis"
        description={profile.isRootTeacher ? "Every student's finished Reading and Listening tests, analysed question by question." : "Your students' finished Reading and Listening tests, analysed question by question."}
      />
      <AnalyticsSubNav isRootTeacher={profile.isRootTeacher} />

      <form method="get" className="border-border/70 bg-card flex flex-wrap items-end gap-3 rounded-2xl border px-5 py-4" data-testid="results-filters">
        <label className="space-y-1 text-xs font-medium">
          <span className="text-muted-foreground">Test</span>
          <select name="test" defaultValue={test ?? ""} className="border-border/70 bg-background block h-9 w-56 rounded-md border px-2 text-sm" data-testid="filter-test">
            <option value="">All tests</option>
            {options.tests.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title} ({option.attempts})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span className="text-muted-foreground">Student</span>
          <select name="student" defaultValue={student ?? ""} className="border-border/70 bg-background block h-9 w-52 rounded-md border px-2 text-sm" data-testid="filter-student">
            <option value="">{profile.isRootTeacher ? "All students" : "All my students"}</option>
            {options.students.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name ?? option.email}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span className="text-muted-foreground">Module</span>
          <select name="skill" defaultValue={skill ?? ""} className="border-border/70 bg-background block h-9 w-36 rounded-md border px-2 text-sm" data-testid="filter-skill">
            <option value="">Reading + Listening</option>
            <option value="READING">Reading</option>
            <option value="LISTENING">Listening</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span className="text-muted-foreground">From</span>
          <input type="date" name="from" defaultValue={from ? from.toISOString().slice(0, 10) : ""} className="border-border/70 bg-background block h-9 rounded-md border px-2 text-sm" data-testid="filter-from" />
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span className="text-muted-foreground">To</span>
          <input type="date" name="to" defaultValue={toStart ? toStart.toISOString().slice(0, 10) : ""} className="border-border/70 bg-background block h-9 rounded-md border px-2 text-sm" data-testid="filter-to" />
        </label>
        <Button type="submit" size="sm" data-testid="filter-apply">
          Show
        </Button>
        {filtered && (
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href="/teacher/analytics/results">Clear filters</Link>
          </Button>
        )}
        <p className="text-muted-foreground w-full text-[11px]">Dates are counted in UTC. Only finished tests count; an internal test (its title starts with an underscore) and a section of a Full Mock that is still being sat are left out.</p>
      </form>

      <ResultsAnalysisView
        overview={overview}
        bands={bands}
        accuracy={analysis.accuracy}
        questions={mostMissed(analysis.questions, 10)}
        allQuestions={test ? analysis.questions : undefined}
        students={students}
        emptyHint={filtered ? "No finished tests match these filters. Widen the dates or clear a filter." : profile.isRootTeacher ? "No student has finished a Reading or Listening test yet." : "None of your students has finished a Reading or Listening test yet."}
      />
    </>
  );
}
