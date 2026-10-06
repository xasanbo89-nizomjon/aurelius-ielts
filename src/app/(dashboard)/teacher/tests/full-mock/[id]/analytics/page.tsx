import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";

import { scopeFor } from "@/lib/exam/test-access";
import { requireTeacherProfile } from "@/lib/session";
import { getFullMockTestAnalytics } from "@/lib/analytics/full-mock-analytics";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Full Mock Analytics" };

export default async function FullMockAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireTeacherProfile();

  const [test, analytics] = await Promise.all([
    prisma.fullMockTest.findFirst({ where: { id, ...scopeFor(profile) }, select: { title: true } }),
    getFullMockTestAnalytics(id, profile.id),
  ]);
  if (!test || !analytics) notFound();

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href={`/teacher/tests/full-mock/${id}`}>
          <ArrowLeft className="size-4" /> Back to builder
        </Link>
      </Button>

      <PageHeader
        title={test.title}
        description="Full Mock Test analytics — every number below is a real student attempt."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/teacher/tests/full-mock/${id}/access-codes`}>
              <KeyRound className="size-4" /> Access Codes
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="py-4">
          <CardContent className="space-y-1 text-center">
            <p className="text-muted-foreground text-xs font-medium">Attempts</p>
            <p className="font-display text-2xl font-medium">{analytics.totalAttempts}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="space-y-1 text-center">
            <p className="text-muted-foreground text-xs font-medium">Completion rate</p>
            <p className="font-display text-2xl font-medium">{analytics.completionRate}%</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="space-y-1 text-center">
            <p className="text-muted-foreground text-xs font-medium">Avg. overall band</p>
            <p className="font-display text-2xl font-medium">{analytics.averageOverallBand?.toFixed(1) ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="space-y-1 text-center">
            <p className="text-muted-foreground text-xs font-medium">Most difficult section</p>
            <p className="font-display text-2xl font-medium">{analytics.mostDifficultSection ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg font-medium">Section breakdown</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {analytics.sectionAverages.map((section) => (
            <Card key={section.label} className="py-4">
              <CardContent className="space-y-1">
                <p className="text-sm font-medium">{section.label}</p>
                <p className="font-display text-xl font-medium">{section.averageBand?.toFixed(1) ?? "—"}</p>
                <p className="text-muted-foreground text-xs">
                  {section.attemptCount} attempt{section.attemptCount === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
