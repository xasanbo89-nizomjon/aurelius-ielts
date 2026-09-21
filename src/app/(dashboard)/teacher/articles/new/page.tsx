import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { ArticleForm } from "@/components/teacher/article-form";

export const metadata: Metadata = { title: "Create Article" };

export default function NewArticlePage() {
  return (
    <>
      <PageHeader title="Create an article" description="Saved as a draft — publish it separately when you're ready." />
      <ArticleForm />
    </>
  );
}
