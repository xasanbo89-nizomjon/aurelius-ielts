import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { NewFullMockForm } from "./new-full-mock-form";

export const metadata: Metadata = { title: "Create Full Mock Test" };

export default async function NewFullMockTestPage() {
  await requireTeacherProfile();

  return (
    <>
      <PageHeader title="Create Full Mock Test" description="Step 1 of 6 — start with the basics, then add each section." />
      <NewFullMockForm />
    </>
  );
}
