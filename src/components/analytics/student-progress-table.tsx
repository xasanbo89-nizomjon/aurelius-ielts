import { Users } from "lucide-react";

import type { StudentProgressRow } from "@/lib/analytics/teacher-insights";
import { formatRelativeTime } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export function StudentProgressTable({ students }: { students: StudentProgressRow[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Student Progress</h2>

      {students.length === 0 ? (
        <EmptyState icon={Users} title="No students yet" description="Student progress will appear here once they join your roster." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Tests Completed</TableHead>
              <TableHead>Average Band</TableHead>
              <TableHead>Last Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => (
              <TableRow key={student.studentId}>
                <TableCell className="font-medium">{student.name ?? student.email}</TableCell>
                <TableCell>{student.testsCompleted}</TableCell>
                <TableCell>
                  {student.avgBand != null ? (
                    <Badge variant="accent">{student.avgBand.toFixed(1)}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {student.lastActive ? formatRelativeTime(student.lastActive) : "Never"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
