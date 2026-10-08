import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Check, CheckCircle2, Crown, History, Send, X } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getSubscriptionSummary } from "@/lib/subscription";
import { listPlansForStudents } from "@/lib/premium-plan-store";
import { getTelegramOwnerUsername } from "@/lib/telegram";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PremiumPlanCard } from "@/components/student/premium-plan-card";
import { PremiumAccountSections } from "@/components/student/premium-account-sections";

export const metadata: Metadata = { title: "Premium" };

/** Phase 48 — Part 3's exact "Premium unlocks" list, plus the real free-tier content every student already gets regardless. */
const FEATURE_COMPARISON: { feature: string; free: boolean; premium: boolean }[] = [
  { feature: "Cambridge Reading & Listening Tests", free: true, premium: true },
  { feature: "Full Mock Tests (Listening + Reading + Writing + Speaking)", free: false, premium: true },
  { feature: "AI Writing Center", free: false, premium: true },
  { feature: "AI Explain More", free: false, premium: true },
  { feature: "AI Study Coach", free: false, premium: true },
  { feature: "AI Speaking Evaluation", free: false, premium: true },
  { feature: "Premium Analytics", free: false, premium: true },
  { feature: "Premium Articles", free: false, premium: true },
];

export default async function StudentPremiumPage() {
  const { user, profile } = await requireStudentProfile();
  const [summary, plans] = await Promise.all([getSubscriptionSummary(profile.id), listPlansForStudents()]);
  // A plan with its own Telegram link does not need the owner username; the warning shows only when some plan has neither.
  const telegramConfigured = getTelegramOwnerUsername() != null || plans.every((plan) => plan.telegramLink != null);

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

      <div className="border-accent/20 bg-accent/[0.04] flex items-center gap-3 rounded-2xl border px-5 py-4">
        <span className="bg-accent/15 text-accent flex size-11 shrink-0 items-center justify-center rounded-xl">
          <Crown className="size-5.5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium">Aurelius IELTS Premium</p>
          <p className="text-muted-foreground text-xs">Full AI-powered IELTS preparation — one plan, every feature, no hidden tiers.</p>
        </div>
      </div>

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

      <div id="plans" className="grid grid-cols-1 gap-6 pt-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="premium-plans">
        {plans.map((plan) => (
          <PremiumPlanCard key={plan.id} plan={plan} studentEmail={user.email ?? ""} studentId={profile.id} />
        ))}
        {plans.length === 0 && <p className="text-muted-foreground col-span-full text-center text-sm">No plans are on sale right now. Please check back soon.</p>}
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Free vs Premium</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feature comparison</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-center">Free / Trial</TableHead>
                  <TableHead className="text-center">Premium</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {FEATURE_COMPARISON.map((row) => (
                  <TableRow key={row.feature}>
                    <TableCell className="font-medium">{row.feature}</TableCell>
                    <TableCell className="text-center">
                      {row.free ? (
                        <Check className="text-success mx-auto size-4" aria-label="Included" />
                      ) : (
                        <X className="text-muted-foreground/50 mx-auto size-4" aria-label="Not included" />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.premium ? (
                        <Check className="text-success mx-auto size-4" aria-label="Included" />
                      ) : (
                        <X className="text-muted-foreground/50 mx-auto size-4" aria-label="Not included" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

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

      <PremiumAccountSections studentId={profile.id} teacherId={profile.teacherId} />
    </>
  );
}
