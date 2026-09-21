"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { assignStudentTeacherAction } from "@/actions/teacher-students.actions";
import type { TeacherOption } from "@/lib/teacher-students";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const UNASSIGNED_VALUE = "unassigned";

export function AssignTeacherSelect({
  studentId,
  currentTeacherId,
  teachers,
}: {
  studentId: string;
  currentTeacherId: string | null;
  teachers: TeacherOption[];
}) {
  const [pending, startTransition] = useTransition();

  function handleChange(value: string) {
    const teacherId = value === UNASSIGNED_VALUE ? null : value;
    startTransition(async () => {
      const result = await assignStudentTeacherAction(studentId, teacherId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(teacherId ? "Teacher assigned." : "Student unassigned.");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={currentTeacherId ?? UNASSIGNED_VALUE} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
          {teachers.map((teacher) => (
            <SelectItem key={teacher.id} value={teacher.id}>
              {teacher.name ?? teacher.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Loader2 className="text-muted-foreground size-3.5 animate-spin" aria-hidden="true" />}
    </div>
  );
}
