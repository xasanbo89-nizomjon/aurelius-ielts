import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Plus } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { listSpeakingTopicsForTeacher } from "@/lib/speaking-practice";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Speaking Topics" };

const PART_LABEL: Record<"PART_1" | "PART_2" | "PART_3", string> = {
  PART_1: "Part 1",
  PART_2: "Part 2",
  PART_3: "Part 3",
};

export default async function SpeakingTopicsPage() {
  const { profile } = await requireTeacherProfile();
  const topics = await listSpeakingTopicsForTeacher(profile.id);

  return (
    <>
      <PageHeader
        title="Speaking Topics"
        description="Speaking Practice Center content — practice only, never graded or linked to an official result."
        actions={
          <Button asChild>
            <Link href="/teacher/speaking-topics/new">
              <Plus className="size-4" /> Create Topic
            </Link>
          </Button>
        }
      />

      {topics.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No topics created yet"
          description="Create a Part 1 question set, a Part 2 cue card, or a Part 3 discussion topic to get started."
          action={
            <Button asChild>
              <Link href="/teacher/speaking-topics/new">
                <Plus className="size-4" /> Create your first topic
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Part</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topics.map((topic) => (
                <TableRow key={topic.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/teacher/speaking-topics/${topic.id}`}
                      className="hover:text-accent focus-visible:text-accent underline-offset-4 outline-none focus-visible:underline"
                    >
                      {topic.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{PART_LABEL[topic.part]}</TableCell>
                  <TableCell>{topic.part === "PART_2" ? "—" : topic._count.questions}</TableCell>
                  <TableCell>{topic._count.attempts}</TableCell>
                  <TableCell>
                    <Badge variant={topic.status === "ARCHIVED" ? "outline" : topic.status === "PUBLISHED" ? "success" : "outline"}>
                      {topic.status === "ARCHIVED" ? "Archived" : topic.status === "PUBLISHED" ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
