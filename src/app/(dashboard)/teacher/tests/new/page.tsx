import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { CreateTestForm } from "@/components/teacher/create-test-form";

export const metadata: Metadata = { title: "Create Test" };

export default function NewTestPage() {
  return (
    <>
      <PageHeader title="Create a test" description="Start with the basics — you'll add passages and questions next." />
      <CreateTestForm />
    </>
  );
}
