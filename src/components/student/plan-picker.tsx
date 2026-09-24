"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

import type { BillingInterval, PaymentProvider } from "@prisma/client";
import { initiateDirectPaymentAction } from "@/actions/payments.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const INTERVAL_LABEL: Record<BillingInterval, string> = { MONTHLY: "month", QUARTERLY: "quarter", YEARLY: "year" };
const PROVIDERS: { value: PaymentProvider; label: string }[] = [
  { value: "CLICK", label: "Click" },
  { value: "PAYME", label: "Payme" },
];

export type PlanPickerItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: BillingInterval;
};

/**
 * Phase 24/26 — Payment Architecture: real plan + invoice architecture, no
 * connected gateway. "Subscribe" now creates a real PENDING Payment +
 * Invoice (queryable in Subscription History), then honestly reports that
 * the chosen provider isn't connected yet — a real recorded intent, not a
 * client-side toast with no trace.
 */
export function PlanPicker({ plans, currentPlanId }: { plans: PlanPickerItem[]; currentPlanId: string | null }) {
  const [provider, setProvider] = useState<PaymentProvider>("CLICK");
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  if (plans.length === 0) return null;

  async function handleSubscribe(planId: string) {
    setLoadingPlanId(planId);
    const result = await initiateDirectPaymentAction(planId, provider);
    setLoadingPlanId(null);

    if (result.status === "NOT_CONNECTED") {
      toast.info(result.message);
    } else if (result.status === "FAILED") {
      toast.error(result.message);
    } else {
      toast.info("Redirecting to payment provider…");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Pay with:</span>
        <Select value={provider} onValueChange={(value) => setProvider(value as PaymentProvider)}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
                  disabled={isCurrent || loadingPlanId === plan.id}
                  onClick={() => handleSubscribe(plan.id)}
                >
                  {isCurrent ? (
                    <>
                      <CheckCircle2 className="size-4" /> Current plan
                    </>
                  ) : loadingPlanId === plan.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Subscribe"
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
