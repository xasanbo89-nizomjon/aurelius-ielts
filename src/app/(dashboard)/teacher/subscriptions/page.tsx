import type { Metadata } from "next";
import { Gem } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Subscription Plans" };

export default async function TeacherSubscriptionsPage() {
  await requireTeacherProfile();

  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { price: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });

  return (
    <>
      <PageHeader title="Subscription Plans" description="Billing plans available to your students." />

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
                  <Badge variant={plan.isActive ? "success" : "outline"}>
                    {plan.isActive ? "Active" : "Inactive"}
                  </Badge>
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
    </>
  );
}
