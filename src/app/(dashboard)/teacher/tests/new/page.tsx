import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, FileUp, Files, Headphones, Layers, ListPlus, PenLine, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { CreateTestForm } from "@/components/teacher/create-test-form";
import { WritingBundleForm } from "@/components/teacher/writing-bundle-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "New Test" };

type TestKind = "reading" | "listening" | "full-mock" | "writing";

const KINDS: { kind: TestKind; title: string; description: string; icon: LucideIcon }[] = [
  { kind: "reading", title: "Reading test", description: "3 passages, 40 questions, 60 minutes.", icon: BookOpen },
  { kind: "listening", title: "Listening test", description: "4 parts, 40 questions, one recording.", icon: Headphones },
  { kind: "full-mock", title: "Full Mock test", description: "Listening, Reading, Writing (and Speaking) as one timed exam.", icon: Layers },
  { kind: "writing", title: "Writing task", description: "A Task 1 or Task 2 prompt for the task bank.", icon: PenLine },
];

/** The ways to make each kind: every one goes to the editor that already exists for it - the wizard only helps to pick the right door. */
const METHODS: Record<TestKind, { href: string; title: string; description: string; icon: LucideIcon }[]> = {
  reading: [
    { href: "/teacher/tests/new?type=reading&method=manual", title: "Build it by hand", description: "Name the test, then add the passages and questions yourself.", icon: ListPlus },
    { href: "/teacher/tests/import", title: "Import from a PDF", description: "Upload the paper and its answer key; check what was read, then confirm.", icon: FileUp },
  ],
  listening: [
    { href: "/teacher/tests/new?type=listening&method=manual", title: "Build it by hand", description: "Name the test, then add the parts, the recording and the questions.", icon: ListPlus },
    { href: "/teacher/tests/import", title: "Import from a PDF", description: "Upload the paper and its answer key; check what was read, then confirm.", icon: FileUp },
  ],
  "full-mock": [
    { href: "/teacher/tests/full-mock/new", title: "Assemble from tests I already have", description: "Pick a published Reading and Listening test and add the Writing and Speaking tasks.", icon: Layers },
    { href: "/teacher/tests/full-mock/quick", title: "Build from files", description: "Upload the Reading and Listening papers and the recording; the whole mock is made in one go.", icon: Files },
  ],
  writing: [
    { href: "/teacher/tests/new?type=writing&method=bundle", title: "Task 1 + Task 2 together", description: "Make a Writing test: both tasks at once, Task 1 with a picture or a page of a PDF.", icon: ListPlus },
    { href: "/teacher/writing", title: "Open the Writing task bank", description: "Every Writing task - edit, publish, assign - is managed there.", icon: PenLine },
  ],
};

const isKind = (value: string | undefined): value is TestKind => KINDS.some((k) => k.kind === value);

function ChoiceCard({ href, title, description, icon: Icon, testId }: { href: string; title: string; description: string; icon: LucideIcon; testId: string }) {
  return (
    <Link href={href} data-testid={testId} className="focus-visible:ring-ring/50 rounded-2xl outline-none focus-visible:ring-2">
      <Card className="hover:border-accent/60 hover:shadow-soft-lg h-full py-5 transition-all">
        <CardContent className="flex items-start gap-3.5 px-5">
          <span className="bg-secondary text-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
            <Icon className="size-5" strokeWidth={1.6} />
          </span>
          <span className="space-y-1">
            <span className="block text-sm font-medium">{title}</span>
            <span className="text-muted-foreground block text-xs leading-relaxed">{description}</span>
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function NewTestPage({ searchParams }: { searchParams: Promise<{ type?: string; method?: string }> }) {
  const { type, method } = await searchParams;
  const kind = isKind(type) ? type : null;

  // Step 3 (Reading / Listening by hand): the form that has always created a test - the module is already chosen.
  if ((kind === "reading" || kind === "listening") && method === "manual") {
    return (
      <>
        <BackLink href={`/teacher/tests/new?type=${kind}`} label="Choose another way" />
        <PageHeader title={`New ${kind} test`} description="Start with the basics - you'll add passages and questions next." />
        <CreateTestForm defaultType={kind === "listening" ? "LISTENING" : "READING"} />
      </>
    );
  }

  // Step 3 (Writing): both tasks made together; they land in the Writing task bank as ordinary tasks.
  if (kind === "writing" && method === "bundle") {
    return (
      <>
        <BackLink href="/teacher/tests/new?type=writing" label="Choose another way" />
        <PageHeader title="New Writing test" description="Task 1 and Task 2 together. They are saved to the Writing task bank as drafts." />
        <WritingBundleForm />
      </>
    );
  }

  // Step 2: how to make it.
  if (kind) {
    const label = KINDS.find((k) => k.kind === kind)!.title;
    return (
      <>
        <BackLink href="/teacher/tests/new" label="Choose another kind" />
        <PageHeader title={`New: ${label}`} description="How do you want to make it?" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="wizard-methods">
          {METHODS[kind].map((method) => (
            <ChoiceCard key={method.href} {...method} testId="wizard-method" />
          ))}
        </div>
      </>
    );
  }

  // Step 1: what to make.
  return (
    <>
      <BackLink href="/teacher/tests" label="Back to tests" />
      <PageHeader title="New test" description="What do you want to create?" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="wizard-kinds">
        {KINDS.map((k) => (
          <ChoiceCard key={k.kind} href={`/teacher/tests/new?type=${k.kind}`} title={k.title} description={k.description} icon={k.icon} testId="wizard-kind" />
        ))}
      </div>
    </>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="-mb-2 w-fit">
      <Link href={href}>
        <ArrowLeft className="size-4" /> {label}
      </Link>
    </Button>
  );
}
