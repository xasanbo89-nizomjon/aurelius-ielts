import type { Metadata } from "next";
import Link from "next/link";
import { AudioLines, History, MessageCircle, Presentation, Shuffle, Users } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";

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
  const { profile } = await requireStudentProfile();
  if (!(await hasActiveAccess(profile.id))) {
    return <PremiumLockScreen feature="Speaking Practice AI" />;
  }
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

      {/* Phase Q-B - the spoken practice with an AI assessment of the real recording sits above the typed practice below it. */}
      <Card className="border-accent/30 bg-accent/5" data-testid="record-card">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="bg-secondary text-accent flex size-11 shrink-0 items-center justify-center rounded-xl">
              <AudioLines className="size-5" strokeWidth={1.75} />
            </span>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-medium">Speak and get an AI assessment</h2>
              <p className="text-muted-foreground text-sm">Record your answer to a Part 1, 2 or 3 question. The AI listens to it and gives you a band for fluency, vocabulary, grammar and pronunciation - an estimate, not an official score.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/student/speaking-practice/recordings">
                <History className="size-4" /> My recordings
              </Link>
            </Button>
            <Button asChild>
              <Link href="/student/speaking-practice/record">Record an answer</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <h2 className="font-display text-lg font-medium">Or practise by typing your answer</h2>
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
