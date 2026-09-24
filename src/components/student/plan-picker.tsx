"use client";

import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

import type { BillingInterval } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const INTERVAL_LABEL: Record<BillingInterval, string> = { MONTHLY: "month", QUARTERLY: "quarter", YEARLY: "year" };

export type PlanPickerItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: BillingInterval;
};

/**
 * Phase 24 — Payment Preparation: real plan architecture and UI, no
 * checkout. Clicking Subscribe is honest about that instead of pretending
 * to process a payment — ask your teacher to activate a plan by hand until
 * a real payment gateway is connected.
 */
export function PlanPicker({ plans, currentPlanId }: { plans: PlanPickerItem[]; currentPlanId: string | null }) {
  if (plans.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {plans.map((plan) => {
        const isCurrent = plan.id === currentPlanId;
        return (
          <Card key={plan.id} className={isCurrent ? "border-accent" : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{plan.name}</CardTitle>
                {isCurrent && <Badge variant="accent">Current</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-display text-2xl font-medium">
                {plan.currency} {plan.price.toFixed(2)}
                <span className="text-muted-foreground ml-1 text-sm font-normal">/ {INTERVAL_LABEL[plan.interval]}</span>
              </p>
              {plan.description && <p className="text-muted-foreground text-sm">{plan.description}</p>}
              <Button
                className="w-full"
                variant={isCurrent ? "outline" : "default"}
                disabled={isCurrent}
                onClick={() => toast.info("Payment processing isn't connected yet — ask your teacher to activate this plan for you.")}
              >
                {isCurrent ? (
                  <>
                    <CheckCircle2 className="size-4" /> Current plan
                  </>
                ) : (
                  "Subscribe"
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
