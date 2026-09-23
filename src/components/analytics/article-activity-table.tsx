import { Newspaper } from "lucide-react";

import type { ArticleActivityRow } from "@/lib/analytics/band-conversation";
import { formatDuration } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export function ArticleActivityTable({ rows }: { rows: ArticleActivityRow[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Article Activity</h2>
      {rows.length === 0 ? (
        <EmptyState icon={Newspaper} title="No articles opened yet" description="Reading and listening progress will appear here once the student opens an article." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Article</TableHead>
              <TableHead>Reading</TableHead>
              <TableHead>Audio</TableHead>
              <TableHead>Vocabulary Saved</TableHead>
              <TableHead>Time Spent</TableHead>
              <TableHead>Last Opened</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.articleId}>
                <TableCell className="font-medium">{row.articleTitle}</TableCell>
                <TableCell>
                  <Badge variant={row.readProgress >= 100 ? "success" : "outline"}>{row.readProgress}%</Badge>
                </TableCell>
                <TableCell>
                  {row.hasAudio ? (
                    <Badge variant={row.audioProgress >= 90 ? "success" : "outline"}>{row.audioProgress}%</Badge>
                  ) : (
                    <span className="text-muted-foreground">No audio</span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{row.vocabularySaved} words</TableCell>
                <TableCell className="text-muted-foreground">{formatDuration(row.timeSpentSeconds)}</TableCell>
                <TableCell className="text-muted-foreground">{row.lastOpenedAt.toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
