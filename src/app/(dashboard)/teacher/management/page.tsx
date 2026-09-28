import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireTeacherProfile } from "@/lib/session";
import { listAllowlistedTeachers, listRootTeacherEmails } from "@/lib/teacher-access";
import { PageHeader } from "@/components/dashboard/page-header";
import { TeacherManagementView } from "@/components/teacher/teacher-management-view";

export const metadata: Metadata = { title: "Teacher Management" };

export default async function TeacherManagementPage() {
  const { profile } = await requireTeacherProfile();
  // Phase 31 — Part 2 security hardening: this page grants/revokes teacher
  // accounts and lists root-teacher identities — root-only, same gate as
  // every other admin surface. Previously missing entirely (found by audit).
  if (!profile.isRootTeacher) redirect("/teacher/dashboard");

  const [teachers, rootTeacherEmails] = await Promise.all([listAllowlistedTeachers(), listRootTeacherEmails()]);

  return (
    <>
      <PageHeader
        title="Teacher Management"
        description="Only these authorized emails can ever become teachers — new sign-ups become students automatically."
      />
      <TeacherManagementView rootTeacherEmails={rootTeacherEmails} teachers={teachers} />
    </>
  );
}
