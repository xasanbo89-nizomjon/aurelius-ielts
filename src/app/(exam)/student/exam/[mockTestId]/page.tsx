import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Clock, FileQuestion, Headphones, Lock } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasActiveAccess } from "@/lib/subscription";
import { startAttemptAction } from "@/actions/exam.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Start Test" };

export default async function ExamStartPage({
  params,
}: {
  params: Promise<{ mockTestId: string }>;
}) {
  const { mockTestId } = await params;
  const { profile } = await requireStudentProfile();

  const test = await prisma.mockTest.findFirst({
    where: { id: mockTestId, isPublished: true, isArchived: false, type: { in: ["READING", "LISTENING"] } },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      category: true,
      durationMinutes: true,
      _count: { select: { questions: true } },
    },
  });

  if (!test) notFound();

  const canStart = test.category === "CAMBRIDGE" || (await hasActiveAccess(profile.id));
  const boundStart = startAttemptAction.bind(null, test.id);
  const Icon = test.type === "LISTENING" ? Headphones : BookOpen;

  return (
    <div className="flex min-h-svh items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg py-8">
        <CardContent className="space-y-7 text-center">
          <span className="bg-secondary text-accent mx-auto flex size-14 items-center justify-center rounded-2xl">
            <Icon className="size-7" strokeWidth={1.5} />
          </span>

          <div className="space-y-2">
            <div className="flex items-center justify-center gap-1.5">
              <Badge variant="outline" className="capitalize">
                {test.type.toLowerCase()} module
              </Badge>
              {test.category === "CAMBRIDGE" && <Badge variant="success">Free</Badge>}
            </div>
            <h1 className="font-display text-2xl font-medium tracking-tight">{test.title}</h1>
            {test.description && <p className="text-muted-foreground text-sm">{test.description}</p>}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-left">
            <div className="bg-secondary/50 rounded-xl px-4 py-3.5">
              <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <FileQuestion className="size-3.5" aria-hidden="true" /> Questions
              </dt>
              <dd className="font-display mt-1 text-xl font-medium">{test._count.questions}</dd>
            </div>
            <div className="bg-secondary/50 rounded-xl px-4 py-3.5">
              <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Clock className="size-3.5" aria-hidden="true" /> Duration
              </dt>
              <dd className="font-display mt-1 text-xl font-medium">
                {test.durationMinutes ? `${test.durationMinutes} min` : "Untimed"}
              </dd>
            </div>
          </dl>

          {canStart ? (
            <>
              <form action={boundStart}>
                <Button type="submit" size="lg" className="w-full">
                  Start test
                </Button>
              </form>
              <p className="text-muted-foreground text-xs">
                Once started, the timer begins and your answers save automatically as you go.
              </p>
            </>
          ) : (
            <>
              <Button asChild size="lg" className="w-full">
                <Link href="/student/subscription?upgrade=1">
                  <Lock className="size-4" /> Upgrade to Premium
                </Link>
              </Button>
              <p className="text-muted-foreground text-xs">
                Your free trial has ended. Upgrade or redeem a promo code to keep taking tests.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
