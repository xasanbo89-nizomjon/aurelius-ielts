import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Gem, Lock } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionSummary } from "@/lib/subscription";
import { listRedemptionsForStudent } from "@/lib/promo-codes";
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_VARIANTS } from "@/lib/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RedeemPromoCodeForm } from "@/components/student/redeem-promo-code-form";
import { PlanPicker } from "@/components/student/plan-picker";
import { listActiveSubscriptionPlans } from "@/lib/subscription-plans";

export const metadata: Metadata = { title: "Subscription" };

export default async function StudentSubscriptionPage() {
  const { profile } = await requireStudentProfile();

  const [summary, redemptions, teacher, plans] = await Promise.all([
    getSubscriptionSummary(profile.id),
    listRedemptionsForStudent(profile.id),
    profile.teacherId
      ? prisma.teacherProfile.findUnique({
          where: { id: profile.teacherId },
          select: { user: { select: { email: true, name: true } } },
        })
      : null,
    listActiveSubscriptionPlans(),
  ]);

  return (
    <>
      <PageHeader title="Subscription" description="Your trial, premium status, and promo codes." />

      {plans.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-xl font-medium tracking-tight">Plans</h2>
          <PlanPicker plans={plans} currentPlanId={summary.subscription.planId} />
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gem className="text-accent size-4.5" aria-hidden="true" /> Current plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={SUBSCRIPTION_STATUS_VARIANTS[summary.status]}>{SUBSCRIPTION_STATUS_LABELS[summary.status]}</Badge>
            {summary.hasAccess && summary.daysRemaining != null && (
              <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <CalendarClock className="size-4" aria-hidden="true" />
                {summary.status === "TRIAL"
                  ? `Trial: ${summary.daysRemaining} day${summary.daysRemaining === 1 ? "" : "s"} remaining`
                  : `Renews in ${summary.daysRemaining} day${summary.daysRemaining === 1 ? "" : "s"}`}
              </span>
            )}
          </div>

          {summary.hasAccess ? (
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden="true" />
              Full access — tests, analytics, and every feature are available.
            </p>
          ) : (
            <div className="border-destructive/20 bg-destructive/5 space-y-3 rounded-xl border p-4">
              <p className="text-destructive flex items-center gap-1.5 text-sm font-medium">
                <Lock className="size-4 shrink-0" aria-hidden="true" />
                Your access has ended. You can still log in and view your profile, but starting or
                submitting tests requires an active subscription.
              </p>
              {teacher ? (
                <Button asChild size="sm">
                  <Link href={`mailto:${teacher.user.email}?subject=Upgrade%20to%20Aurelius%20IELTS%20Premium`}>
                    <Gem className="size-4" /> Contact {teacher.user.name ?? "your teacher"} to upgrade
                  </Link>
                </Button>
              ) : (
                <p className="text-muted-foreground text-xs">
                  You don&apos;t have a teacher assigned yet — ask your school&apos;s administrator for a
                  promo code or Premium access.
                </p>
              )}
              <p className="text-muted-foreground text-xs">Or redeem a promo code below.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <RedeemPromoCodeForm />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Redemption History</h2>
        {redemptions.length === 0 ? (
          <EmptyState
            icon={Gem}
            title="No promo codes redeemed yet"
            description="Codes you redeem will show up here, along with what they gave you."
          />
        ) : (
          <Card className="gap-0 py-2">
            <CardContent className="divide-border/70 divide-y px-0">
              {redemptions.map((redemption) => (
                <div key={redemption.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                  <div className="space-y-0.5">
                    <p className="font-mono text-sm font-medium">{redemption.code}</p>
                    <p className="text-muted-foreground text-xs">{redemption.redeemedAt.toLocaleDateString()}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    {redemption.bonusTrialDays > 0 && (
                      <Badge variant="accent">+{redemption.bonusTrialDays} days</Badge>
                    )}
                    {redemption.discountPercent != null && (
                      <Badge variant="success">{redemption.discountPercent}% off</Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
