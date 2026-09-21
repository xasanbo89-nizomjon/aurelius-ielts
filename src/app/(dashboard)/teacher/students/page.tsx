import type { Metadata } from "next";
import { Award, Coins, Flame, Target, Users } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getStudentRoster, listAllTeachers, STUDENT_ROSTER_PAGE_SIZE } from "@/lib/teacher-students";
import { getStudentTrialInfoForRoster } from "@/lib/trial-management";
import { getTeacherEngagementInsights, type RankedStudent } from "@/lib/teacher-engagement-insights";
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_VARIANTS } from "@/lib/labels";
import { formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import { AssignTeacherSelect } from "@/components/teacher/assign-teacher-select";
import { TrialActionsCell } from "@/components/teacher/trial-actions-cell";

function RankedList({ items, formatValue, emptyLabel }: { items: RankedStudent[]; formatValue: (value: number) => string; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  }
  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li key={item.studentId} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground mr-2 tabular-nums">{index + 1}.</span>
            {item.name ?? item.email}
          </span>
          <span className="text-muted-foreground shrink-0 tabular-nums">{formatValue(item.value)}</span>
        </li>
      ))}
    </ol>
  );
}

export const metadata: Metadata = { title: "Students" };

export default async function TeacherStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { user, profile } = await requireTeacherProfile();
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { students, total, isRootView } = await getStudentRoster(profile.id, user.email, { search: q, page });
  const teachers = isRootView ? await listAllTeachers() : [];
  const insights = await getTeacherEngagementInsights(profile.id);
  // Trial Management (bonus feature) is root-teacher-only — bounded by
  // pagination (≤10 students), so a per-student summary lookup here never
  // becomes a real N+1 concern, and it stays perfectly consistent with
  // whatever the student's own subscription page/dashboard banner shows.
  const trialInfo = isRootView ? await getStudentTrialInfoForRoster(students.map((s) => s.id)) : {};

  const totalPages = Math.max(1, Math.ceil(total / STUDENT_ROSTER_PAGE_SIZE));
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/teacher/students?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Students"
        description={
          isRootView
            ? "Every student on the platform — assign each one to a teacher."
            : "Everyone assigned to your teaching account."
        }
        actions={<SearchInput name="q" placeholder="Search by name or email…" defaultValue={q} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Students" value={String(total)} icon={Users} />
        <StatCard
          label="Goal Achievement Rate"
          value={insights.goalAchievement.ratePercent != null ? `${insights.goalAchievement.ratePercent}%` : "—"}
          icon={Target}
          caption={
            insights.goalAchievement.studentsWithGoal === 0
              ? "No students have set a target band yet"
              : `${insights.goalAchievement.studentsAtOrAboveTarget} / ${insights.goalAchievement.studentsWithGoal} at or above target`
          }
        />
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Student Engagement Insights</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Flame className="text-accent size-4.5" aria-hidden="true" /> Most Active Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RankedList items={insights.mostActiveStudents} formatValue={formatDuration} emptyLabel="No real study activity yet." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Award className="text-accent size-4.5" aria-hidden="true" /> Highest Streaks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RankedList
                items={insights.highestStreaks}
                formatValue={(v) => `${v} day${v === 1 ? "" : "s"}`}
                emptyLabel="No active streaks yet."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Coins className="text-accent size-4.5" aria-hidden="true" /> Most Coins Earned
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RankedList items={insights.mostCoinsEarned} formatValue={(v) => `${v} coins`} emptyLabel="No coins earned yet." />
            </CardContent>
          </Card>
        </div>
      </section>

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "No matching students" : "No students yet"}
          description={
            q
              ? `No students found for "${q}". Try a different search.`
              : isRootView
                ? "Students will appear here as soon as they register."
                : "Students assigned to you will appear here."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>CEFR Level</TableHead>
                <TableHead>Assigned Teacher</TableHead>
                {isRootView && (
                  <>
                    <TableHead>Trial Status</TableHead>
                    <TableHead>Trial Expiry</TableHead>
                    <TableHead>Days Remaining</TableHead>
                    <TableHead>Trial Actions</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => {
                const trial = trialInfo[student.id];
                return (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{student.email}</TableCell>
                    <TableCell className="text-muted-foreground">{student.joinedAt.toLocaleDateString()}</TableCell>
                    <TableCell>
                      {student.cefrLevel ? (
                        <Badge variant="accent">{student.cefrLevel}</Badge>
                      ) : (
                        <span className="text-muted-foreground">Not enough data</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isRootView ? (
                        <AssignTeacherSelect studentId={student.id} currentTeacherId={student.teacherId} teachers={teachers} />
                      ) : (
                        <span className="text-muted-foreground">{student.teacherName ?? "Unassigned"}</span>
                      )}
                    </TableCell>
                    {isRootView && trial && (
                      <>
                        <TableCell>
                          <div className="space-y-0.5">
                            <Badge variant={SUBSCRIPTION_STATUS_VARIANTS[trial.status]}>
                              {SUBSCRIPTION_STATUS_LABELS[trial.status]}
                            </Badge>
                            <p className="text-muted-foreground text-xs">
                              Started {trial.subscription.startDate.toLocaleDateString()}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {trial.subscription.endDate ? trial.subscription.endDate.toLocaleDateString() : "No expiry"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {trial.daysRemaining != null ? `${trial.daysRemaining} day${trial.daysRemaining === 1 ? "" : "s"}` : "—"}
                        </TableCell>
                        <TableCell>
                          <TrialActionsCell studentId={student.id} studentLabel={student.name ?? student.email} />
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </>
  );
}
