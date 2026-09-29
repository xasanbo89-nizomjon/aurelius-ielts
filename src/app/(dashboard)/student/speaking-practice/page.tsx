import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Presentation, Shuffle, Users } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Speaking Practice" };

const PARTS = [
  {
    part: "PART_1",
    title: "Part 1 — Introduction",
    icon: Users,
    description: "Short personal questions about everyday topics — your hometown, hobbies, studies.",
    example: '"Where do you live?" · "Do you enjoy reading?"',
  },
  {
    part: "PART_2",
    title: "Part 2 — Cue Card",
    icon: Presentation,
    description: "1 minute to prepare, then speak for up to 2 minutes on a given topic with bullet points to cover.",
    example: '"Describe a person you admire."',
  },
  {
    part: "PART_3",
    title: "Part 3 — Discussion",
    icon: MessageCircle,
    description: "Deeper discussion questions that connect to your Part 2 topic.",
    example: '"Why do people admire successful individuals?"',
  },
  {
    part: "MIXED",
    title: "Mixed Practice",
    icon: Shuffle,
    description: "A complete session — one random Part 1 question, one Part 2 cue card, one Part 3 question, back to back.",
    example: "A full practice round, all 3 parts.",
  },
] as const;

export default async function SpeakingPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireStudentProfile();
  const { error } = await searchParams;

  return (
    <>
      <PageHeader
        title="Speaking Practice"
        description="Practice IELTS Speaking questions and get instant AI feedback — this is practice only, not an official score."
      />

      {error === "no-content" && (
        <div className="border-destructive/20 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm">
          Your teacher hasn&apos;t published any questions for that part yet. Try a different part, or check back soon.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        {PARTS.map(({ part, title, icon: Icon, description, example }) => (
          <Card key={part} className="h-full">
            <CardContent className="flex h-full flex-col gap-3">
              <span className="bg-secondary text-accent flex size-11 shrink-0 items-center justify-center rounded-xl">
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              <div className="flex-1 space-y-1.5">
                <h2 className="font-display text-lg font-medium">{title}</h2>
                <p className="text-muted-foreground text-sm">{description}</p>
                <p className="text-muted-foreground/80 text-xs italic">{example}</p>
              </div>
              <Button asChild className="w-full">
                <Link href={`/student/speaking-practice/start?part=${part}`}>Start Practice</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
