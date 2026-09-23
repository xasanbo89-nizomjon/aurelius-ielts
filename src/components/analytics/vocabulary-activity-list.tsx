import { BookMarked } from "lucide-react";

import type { VocabularyActivityRow } from "@/lib/analytics/band-conversation";
import { VOCABULARY_STATUS_LABELS, VOCABULARY_STATUS_EMOJI } from "@/lib/labels";
import { formatRelativeTime } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

/** Recent word-by-word activity, so a teacher can review real vocabulary weaknesses — the red/unknown rows — alongside everything else known about this student. */
export function VocabularyActivityList({ rows }: { rows: VocabularyActivityRow[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Recent Vocabulary Activity</h2>
      {rows.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No vocabulary activity yet"
          description="Words this student clicks while reading an article are automatically saved and will appear here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Word</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>From Article</TableHead>
              <TableHead>Last Reviewed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.word}>
                <TableCell className="font-medium">{row.word}</TableCell>
                <TableCell>
                  <Badge variant={row.status === "UNKNOWN" ? "destructive" : row.status === "LEARNING" ? "outline" : "success"}>
                    {VOCABULARY_STATUS_EMOJI[row.status]} {VOCABULARY_STATUS_LABELS[row.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{row.articleTitle ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatRelativeTime(row.lastReviewedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
