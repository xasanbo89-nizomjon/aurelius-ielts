import type { Metadata } from "next";
import Link from "next/link";
import { Users, UserCheck, ClipboardCheck, Gauge } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import {
  getBandConversationOverview,
  getBandConversationStudents,
  BAND_CONVERSATION_PAGE_SIZE,
  type BandConversationStatusFilter,
} from "@/lib/analytics/band-conversation";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { BandConversationFilters } from "@/components/analytics/band-conversation-filters";

export const metadata: Metadata = { title: "Band Conversation" };

const VALID_STATUSES: BandConversationStatusFilter[] = ["all", "active", "inactive"];

export default async function BandConversationPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { q, status: statusParam, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const status: BandConversationStatusFilter = VALID_STATUSES.includes(statusParam as BandConversationStatusFilter)
    ? (statusParam as BandConversationStatusFilter)
    : "all";

  const [overview, { students, total }] = await Promise.all([
    getBandConversationOverview(profile.id),
    getBandConversationStudents(profile.id, { search: q, status, page }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / BAND_CONVERSATION_PAGE_SIZE));
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "all") params.set("status", status);
    params.set("page", String(p));
    return `/teacher/band-conversation?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Band Conversation"
        description="Every student's Reading and Listening performance history, in one place."
        actions={<BandConversationFilters defaultSearch={q} defaultStatus={status} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Students" value={String(overview.totalStudents)} icon={Users} />
        <StatCard
          label="Active Students"
          value={String(overview.activeStudents)}
          icon={UserCheck}
          caption="Studied in the last 30 days"
        />
        <StatCard label="Total Tests Taken" value={String(overview.totalTestsTaken)} icon={ClipboardCheck} />
        <StatCard
          label="Average Band Score"
          value={overview.averageBandScore != null ? overview.averageBandScore.toFixed(1) : "—"}
          icon={Gauge}
          caption={overview.averageBandScore == null ? "No scored tests yet" : "Across Reading & Listening"}
        />
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q || status !== "all" ? "No matching students" : "No students assigned yet"}
          description={
            q || status !== "all"
              ? "Try a different search or filter."
              : "Students assigned to you will appear here."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Current Estimated Band</TableHead>
                <TableHead>Tests Completed</TableHead>
                <TableHead>Vocabulary Score</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id} className="hover:bg-secondary/40">
                  <TableCell className="font-medium">
                    <Link href={`/teacher/band-conversation/${student.id}`} className="hover:underline">
                      {student.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{student.email}</TableCell>
                  <TableCell>
                    {student.currentEstimatedBand != null ? (
                      <Badge variant="accent">{student.currentEstimatedBand.toFixed(1)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{student.testsCompleted}</TableCell>
                  <TableCell>
                    {student.vocabularyScore != null ? (
                      <Badge variant={student.vocabularyScore >= 70 ? "success" : "outline"}>{student.vocabularyScore}%</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {student.lastActivityDate ? student.lastActivityDate.toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={student.isActive ? "success" : "secondary"}>
                      {student.isActive ? "Active" : "Inactive"}
                    </Badge>
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
