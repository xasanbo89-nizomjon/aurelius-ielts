import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ImageIcon, Mic, Plus } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { listSpeakingTasksForTeacher } from "@/lib/speaking";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FallbackImage } from "@/components/ui/fallback-image";

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
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher/speaking/analytics">
                <BarChart3 className="size-4" /> Analytics
              </Link>
            </Button>
            <Button asChild>
              <Link href="/teacher/speaking/new">
                <Plus className="size-4" /> Create task
              </Link>
            </Button>
          </div>
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
                  <Link href={`/teacher/speaking/${task.id}`} className="flex items-center gap-2.5 hover:underline">
                    <span className="bg-secondary relative size-8 shrink-0 overflow-hidden rounded-md">
                      {task.coverImagePath ? (
                        <FallbackImage src={task.coverImagePath} alt="" fill sizes="32px" className="object-cover" unoptimized />
                      ) : (
                        <ImageIcon className="text-muted-foreground absolute inset-0 m-auto size-4" strokeWidth={1.5} />
                      )}
                    </span>
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
