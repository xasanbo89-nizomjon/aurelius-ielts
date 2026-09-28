import type { Metadata } from "next";
import { Eye, Newspaper } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getMostViewedContent, getArticleDropOffPoints } from "@/lib/analytics/content-analytics";
import { PageHeader } from "@/components/dashboard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BarChart, type BarChartDatum } from "@/components/analytics/charts/bar-chart";

export const metadata: Metadata = { title: "Content Analytics" };

const TYPE_LABEL = { ARTICLE: "Article", TEST: "Test", WRITING_TASK: "Writing Task", SPEAKING_TASK: "Speaking Task" } as const;

export default async function ContentAnalyticsPage() {
  const { profile } = await requireTeacherProfile();

  const [content, dropOff] = await Promise.all([
    getMostViewedContent(profile.id, 15),
    getArticleDropOffPoints(profile.id),
  ]);

  const dropOffData: BarChartDatum[] = dropOff.map((bucket) => ({ label: bucket.range, value: bucket.count }));

  return (
    <>
      <PageHeader title="Content Analytics" description="Real engagement across your own articles, tests, writing tasks and speaking tasks." />

      <section className="space-y-4">
        <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
          <Eye className="text-accent size-5" aria-hidden="true" /> Most Viewed / Attempted Content
        </h2>
        {content.length === 0 ? (
          <EmptyState icon={Eye} title="No content yet" description="Create articles, tests, writing tasks or speaking tasks to see real engagement here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Engagement</TableHead>
                <TableHead>Completion Rate</TableHead>
                <TableHead>Average Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {content.map((row) => (
                <TableRow key={`${row.type}-${row.id}`}>
                  <TableCell className="max-w-xs truncate font-medium">{row.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABEL[row.type]}</Badge>
                  </TableCell>
                  <TableCell>{row.engagementCount}</TableCell>
                  <TableCell>{row.completionRate != null ? `${row.completionRate}%` : "—"}</TableCell>
                  <TableCell>{row.avgScore != null ? row.avgScore.toFixed(1) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
          <Newspaper className="text-accent size-5" aria-hidden="true" /> Article Drop-Off Points
        </h2>
        {dropOff.every((b) => b.count === 0) ? (
          <EmptyState icon={Newspaper} title="No incomplete reads yet" description="Where students stop reading (as a % through the article) will show up here." />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where readers stop, among unfinished reads</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart data={dropOffData} color="var(--destructive)" ariaLabel="Number of unfinished reads by how far through the article the reader stopped" />
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
