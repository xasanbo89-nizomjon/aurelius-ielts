import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, GraduationCap, Gem, ClipboardCheck, Newspaper, Sparkles, Database, Activity, ArrowRight } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getSystemHealthSnapshot } from "@/lib/analytics/system-health";
import { listRecentErrors } from "@/lib/monitoring/metrics-store";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata: Metadata = { title: "System Health" };

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default async function SystemHealthPage() {
  const { profile } = await requireTeacherProfile();
  if (!profile.isRootTeacher) redirect("/teacher/dashboard");

  const [health, recentErrors] = await Promise.all([getSystemHealthSnapshot(), Promise.resolve(listRecentErrors(10))]);

  return (
    <>
      <PageHeader
        title="System Health"
        description="Real, live production numbers — the final pre-launch snapshot of the whole platform."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/teacher/analytics/health">
              In-process metrics <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={health.totalUsers.toLocaleString()} icon={Users} caption={`${health.totalStudents} students · ${health.totalTeachers} teachers`} />
        <StatCard label="Teachers" value={health.totalTeachers.toLocaleString()} icon={GraduationCap} />
        <StatCard label="Active Subscriptions" value={health.activeSubscriptions.toLocaleString()} icon={Gem} />
        <StatCard label="Tests Completed" value={health.testsCompleted.toLocaleString()} icon={ClipboardCheck} />
        <StatCard label="Articles" value={health.articlesCount.toLocaleString()} icon={Newspaper} />
        <StatCard label="AI Requests (all-time)" value={health.aiRequestsCount.toLocaleString()} icon={Sparkles} caption="Explain More + Writing + Vocabulary + Speaking + Writing Analysis" />
        <StatCard
          label="Database Storage"
          value={formatBytes(health.database.sizeBytes)}
          icon={Database}
          caption="Real Postgres database size"
        />
        <StatCard
          label="Database Status"
          value={health.database.status === "CONNECTED" ? "Connected" : "Error"}
          icon={Activity}
          valueClassName={health.database.status === "CONNECTED" ? "text-success" : "text-destructive"}
          caption={health.database.responseMs != null ? `${health.database.responseMs}ms response` : undefined}
        />
      </div>

      {health.database.version && (
        <p className="text-muted-foreground text-xs">Postgres: {health.database.version}</p>
      )}

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Recent Server Errors</h2>
        <p className="text-muted-foreground text-sm">
          From this process&apos;s own in-memory log (see Platform Health for more) — resets on every restart/redeploy, so an empty list here can
          mean either a healthy platform or a recent deploy, not necessarily zero errors ever.
        </p>
        {recentErrors.length === 0 ? (
          <EmptyState icon={Activity} title="No recent errors" description="Nothing has been logged on this server instance." />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Last {recentErrors.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {recentErrors.map((err, index) => (
                  <li key={index} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <Badge variant="outline" className="mb-1">
                        {err.context}
                      </Badge>
                      <p className="text-muted-foreground truncate text-xs">{err.message}</p>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">{new Date(err.at).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
