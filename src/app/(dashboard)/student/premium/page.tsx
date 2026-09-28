import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, History, Send } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getSubscriptionSummary } from "@/lib/subscription";
import { PREMIUM_PLANS } from "@/lib/premium-plans";
import { getTelegramOwnerUsername } from "@/lib/telegram";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PremiumPlanCard } from "@/components/student/premium-plan-card";

export const metadata: Metadata = { title: "Premium" };

export default async function StudentPremiumPage() {
  const { user, profile } = await requireStudentProfile();
  const summary = await getSubscriptionSummary(profile.id);
  const telegramConfigured = getTelegramOwnerUsername() != null;

  return (
    <>
      <PageHeader
        title="Aurelius Premium"
        description="Unlock every AI feature — pick a plan and buy instantly on Telegram."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/student/premium/history">
              <History className="size-4" /> Purchase History
            </Link>
          </Button>
        }
      />

      {summary.hasAccess && summary.status === "ACTIVE" && summary.daysRemaining != null && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex items-center gap-3">
            <CheckCircle2 className="text-success size-5 shrink-0" aria-hidden="true" />
            <p className="text-sm">
              You already have Premium active —{" "}
              <span className="font-medium">
                {summary.daysRemaining} day{summary.daysRemaining === 1 ? "" : "s"} remaining
              </span>
              . Buying another plan below will extend it.
            </p>
          </CardContent>
        </Card>
      )}

      {!telegramConfigured && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3">
            <CalendarClock className="text-destructive size-5 shrink-0" aria-hidden="true" />
            <p className="text-sm">Telegram purchasing isn&apos;t configured on this server yet — ask your administrator to set it up.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 pt-2 sm:grid-cols-3">
        {PREMIUM_PLANS.map((plan) => (
          <PremiumPlanCard key={plan.code} plan={plan} studentEmail={user.email ?? ""} studentId={profile.id} />
        ))}
      </div>

      <Card className="gap-0 py-5">
        <CardContent className="flex items-start gap-3">
          <Send className="text-accent mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">How it works</p>
            <p className="text-muted-foreground">
              Pick a plan, tap &quot;Buy via Telegram&quot; — we&apos;ll open a chat with your plan, email and student ID already filled in. Send the
              message, complete payment with the owner, and your Premium is activated as soon as it&apos;s confirmed.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
