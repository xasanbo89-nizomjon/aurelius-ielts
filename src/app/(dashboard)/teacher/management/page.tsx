import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { listAllowlistedTeachers, ROOT_TEACHER_EMAIL } from "@/lib/teacher-access";
import { PageHeader } from "@/components/dashboard/page-header";
import { TeacherManagementView } from "@/components/teacher/teacher-management-view";

export const metadata: Metadata = { title: "Teacher Management" };

export default async function TeacherManagementPage() {
  await requireTeacherProfile();
  const teachers = await listAllowlistedTeachers();

  return (
    <>
      <PageHeader
        title="Teacher Management"
        description="Only these authorized emails can ever become teachers — new sign-ups become students automatically."
      />
      <TeacherManagementView rootEmail={ROOT_TEACHER_EMAIL} teachers={teachers} />
    </>
  );
}
