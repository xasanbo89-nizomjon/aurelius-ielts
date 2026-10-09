import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, Database, Gauge, Sparkles } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getPlatformHealthSnapshot } from "@/lib/analytics/platform-health";
import { getExplanationUsage } from "@/lib/ai/explanation-generation";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata: Metadata = { title: "Platform Health" };

export default async function PlatformHealthPage() {
  const { profile } = await requireTeacherProfile();
  if (!profile.isRootTeacher) redirect("/teacher/dashboard");

  const health = await getPlatformHealthSnapshot();
  // Phase M2 - the stored-explanation writer keeps its own DURABLE log (every request that reached the model, with its tokens): unlike the table above it survives a restart.
  const explanationUsage = await getExplanationUsage();

  return (
    <>
      <PageHeader
        title="Platform Health Monitor"
        description="Internal, real-time metrics from this server process — no external monitoring service involved."
      />

      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          These numbers are recorded in-memory by this single server process and reset on every restart or redeploy —
          they reflect real recent activity on this instance, not a durable historical record.
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
          <Database className="text-accent size-5" aria-hidden="true" /> Database Query Performance
        </h2>
        {health.dbMetrics.length === 0 ? (
          <EmptyState icon={Database} title="No query samples yet" description="Timed queries will appear here once the analytics dashboards have been visited on this server instance." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query</TableHead>
                <TableHead>Samples</TableHead>
                <TableHead>Avg</TableHead>
                <TableHead>P95</TableHead>
                <TableHead>Failure Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.dbMetrics.map((m) => (
                <TableRow key={m.key}>
                  <TableCell className="font-mono text-xs">{m.key.replace(/^db:/, "")}</TableCell>
                  <TableCell>{m.count}</TableCell>
                  <TableCell>{m.avgMs}ms</TableCell>
                  <TableCell>{m.p95Ms}ms</TableCell>
                  <TableCell>
                    <Badge variant={m.failureRatePercent > 0 ? "destructive" : "outline"}>{m.failureRatePercent}%</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
          <Sparkles className="text-accent size-5" aria-hidden="true" /> OpenAI Usage
        </h2>
        {health.aiMetrics.length === 0 ? (
          <EmptyState icon={Sparkles} title="No AI calls recorded yet" description="Response times and token usage per AI feature will appear here after real calls on this server instance." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Avg Response Time</TableHead>
                <TableHead>Failure Rate</TableHead>
                <TableHead>Total Tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.aiMetrics.map((m) => {
                const schemaName = m.key.replace(/^ai:/, "");
                const tokens = health.aiTokenUsage.find((t) => t.schemaName === schemaName);
                return (
                  <TableRow key={m.key}>
                    <TableCell className="font-mono text-xs">{schemaName}</TableCell>
                    <TableCell>{m.count}</TableCell>
                    <TableCell>{m.avgMs}ms</TableCell>
                    <TableCell>
                      <Badge variant={m.failureRatePercent > 0 ? "destructive" : "outline"}>{m.failureRatePercent}%</Badge>
                    </TableCell>
                    <TableCell>{tokens ? tokens.totalTokens.toLocaleString() : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="space-y-2" data-testid="explanation-usage">
          <h3 className="text-sm font-medium">Stored explanations - every request to the model (a durable log: a restart does not reset it)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Prompt tokens</TableHead>
                <TableHead>Completion tokens</TableHead>
                <TableHead>Total tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(
                [
                  ["Today", explanationUsage.today],
                  ["Last 30 days", explanationUsage.last30Days],
                  ["All time", explanationUsage.allTime],
                  ["of which automatic (publish / backfill), 30 days", explanationUsage.automaticLast30Days],
                  ["of which automatic, all time", explanationUsage.automaticAllTime],
                ] as const
              ).map(([label, row]) => (
                <TableRow key={label} data-testid={`explanation-usage-${label.toLowerCase().replace(/ /g, "-")}`}>
                  <TableCell>{label}</TableCell>
                  <TableCell>{row.requests.toLocaleString()}</TableCell>
                  <TableCell>{row.promptTokens.toLocaleString()}</TableCell>
                  <TableCell>{row.completionTokens.toLocaleString()}</TableCell>
                  <TableCell>{(row.promptTokens + row.completionTokens).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
          <Gauge className="text-accent size-5" aria-hidden="true" /> Cache Performance
        </h2>
        <p className="text-muted-foreground text-sm">Real hit/miss counts from every AI action&apos;s servedFromCache flag — a durable, DB-backed record, not in-memory.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Hits</TableHead>
              <TableHead>Misses</TableHead>
              <TableHead>Hit Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {health.cacheHitRates.map((c) => (
              <TableRow key={c.source}>
                <TableCell className="font-medium">{c.source}</TableCell>
                <TableCell>{c.hits}</TableCell>
                <TableCell>{c.misses}</TableCell>
                <TableCell>{c.hitRatePercent != null ? `${c.hitRatePercent}%` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-4">
        <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
          <Activity className="text-accent size-5" aria-hidden="true" /> API Response Times
        </h2>
        <p className="text-muted-foreground text-sm">
          Covers this app&apos;s own heavy data-fetching calls (the analytics dashboards above) — not every HTTP route in the app, which would need a
          dedicated APM layer beyond this phase&apos;s scope. See src/lib/monitoring/metrics-store.ts.
        </p>
      </section>
    </>
  );
}
