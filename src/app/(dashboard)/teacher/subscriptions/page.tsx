import type { Metadata } from "next";
import Link from "next/link";
import { Gem, Users } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { listSubscriptionPlans } from "@/lib/subscription-plans";
import { listSubscribersForRoot } from "@/lib/trial-management";
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_VARIANTS } from "@/lib/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateSubscriptionPlanForm } from "@/components/teacher/create-subscription-plan-form";
import { SubscriptionPlanActiveToggle } from "@/components/teacher/subscription-plan-active-toggle";
import { AdminPremiumControls } from "@/components/teacher/admin-premium-controls";

export const metadata: Metadata = { title: "Subscription Plans" };

const STATUS_FILTERS = ["ALL", "ACTIVE", "TRIAL", "EXPIRED", "CANCELLED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default async function TeacherSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { profile } = await requireTeacherProfile();

  const { status: statusParam } = await searchParams;
  const status: StatusFilter = STATUS_FILTERS.includes(statusParam as StatusFilter) ? (statusParam as StatusFilter) : "ALL";

  const [plans, subscribers] = await Promise.all([
    listSubscriptionPlans(),
    profile.isRootTeacher ? listSubscribersForRoot(status) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Subscription Plans"
        description="Billing plans available to your students. Payment processing isn't connected yet — this is the real pricing architecture, activated once a gateway is wired up."
        actions={profile.isRootTeacher ? <CreateSubscriptionPlanForm /> : undefined}
      />

      {plans.length === 0 ? (
        <EmptyState
          icon={Gem}
          title="No subscription plans yet"
          description="Create pricing plans to start offering paid access to your students."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={plan.isActive ? "success" : "outline"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
                    {profile.isRootTeacher && <SubscriptionPlanActiveToggle planId={plan.id} isActive={plan.isActive} />}
                  </div>
                </div>
                {plan.description && <CardDescription>{plan.description}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-display text-2xl font-medium">
                  {plan.currency} {plan.price.toFixed(2)}
                  <span className="text-muted-foreground ml-1 text-sm font-normal">
                    / {plan.interval.toLowerCase()}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">{plan._count.subscriptions} subscribers</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {profile.isRootTeacher && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
              <Users className="text-accent size-5" aria-hidden="true" /> Subscription Management
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((filter) => (
                <Button key={filter} asChild size="sm" variant={filter === status ? "default" : "outline"}>
                  <Link href={filter === "ALL" ? "/teacher/subscriptions" : `/teacher/subscriptions?status=${filter}`}>
                    {filter === "ALL" ? "All" : SUBSCRIPTION_STATUS_LABELS[filter]}
                  </Link>
                </Button>
              ))}
            </div>
          </div>

          {subscribers.length === 0 ? (
            <EmptyState icon={Users} title="No subscribers" description="No students match this filter yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Remaining Days</TableHead>
                  <TableHead className="sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell className="font-medium">{row.name ?? row.email}</TableCell>
                    <TableCell className="text-muted-foreground">{row.planLabel}</TableCell>
                    <TableCell>
                      <Badge variant={SUBSCRIPTION_STATUS_VARIANTS[row.status]}>{SUBSCRIPTION_STATUS_LABELS[row.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.startDate.toLocaleDateString()}</TableCell>
                    <TableCell className="text-muted-foreground">{row.endDate ? row.endDate.toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.remainingDays != null ? row.remainingDays : "—"}</TableCell>
                    <TableCell>
                      <AdminPremiumControls studentId={row.studentId} studentLabel={row.name ?? row.email} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </>
  );
}
