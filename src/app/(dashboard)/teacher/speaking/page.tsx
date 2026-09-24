import type { Metadata } from "next";
import Link from "next/link";
import { Mic, Plus } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { listSpeakingTasksForTeacher } from "@/lib/speaking";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Speaking Tasks" };

const STATUS_VARIANT = { DRAFT: "outline", PUBLISHED: "success", ARCHIVED: "outline" } as const;

export default async function TeacherSpeakingPage() {
  const { profile } = await requireTeacherProfile();
  const tasks = await listSpeakingTasksForTeacher(profile.id);

  return (
    <>
      <PageHeader
        title="Speaking Tasks"
        description="Create Speaking tasks and share their code with students."
        actions={
          <Button asChild>
            <Link href="/teacher/speaking/new">
              <Plus className="size-4" /> Create task
            </Link>
          </Button>
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={Mic}
          title="No speaking tasks yet"
          description="Create your first task — students will enter its code to record a response."
          action={
            <Button asChild>
              <Link href="/teacher/speaking/new">
                <Plus className="size-4" /> Create your first task
              </Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Part</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Submissions</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">
                  <Link href={`/teacher/speaking/${task.id}`} className="hover:underline">
                    {task.title}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">Part {task.part}</TableCell>
                <TableCell className="font-mono text-xs">{task.code}</TableCell>
                <TableCell>{task._count.submissions}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[task.status]}>{task.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
