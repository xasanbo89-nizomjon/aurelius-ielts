"use client";

import { useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { createPremiumRequestAction } from "@/actions/premium-requests.actions";
import { buildTelegramPurchaseUrl } from "@/lib/telegram";
import type { PremiumPlan } from "@/lib/premium-plans";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BADGE_VARIANT = { POPULAR: "accent", "BEST VALUE": "success" } as const;

export function PremiumPlanCard({ plan, studentEmail, studentId }: { plan: PremiumPlan; studentEmail: string; studentId: string }) {
  const [pending, setPending] = useState(false);

  async function handleBuy() {
    setPending(true);
    try {
      const result = await createPremiumRequestAction(plan.code);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const url = buildTelegramPurchaseUrl(plan.title, studentEmail, studentId);
      if (!url) {
        toast.error("Telegram purchasing isn't set up yet — ask your administrator to configure it.");
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("Request created — finish your purchase on Telegram.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      className={cn(
        "relative gap-0 py-6 transition-all duration-[250ms]",
        plan.badge && "border-accent/40 shadow-soft-lg"
      )}
    >
      {plan.badge && (
        <Badge variant={BADGE_VARIANT[plan.badge]} className="absolute -top-3 left-1/2 -translate-x-1/2">
          {plan.badge}
        </Badge>
      )}
      <CardContent className="flex h-full flex-col gap-5">
        <div className="space-y-1 text-center">
          <p className="text-muted-foreground text-sm font-medium">{plan.title}</p>
          <p className="font-display text-4xl font-medium tracking-tight">{plan.priceLabel}</p>
          <p className="text-muted-foreground text-xs">{plan.durationLabel}</p>
        </div>

        <ul className="flex-1 space-y-2.5">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>

        <Button onClick={handleBuy} disabled={pending} className="w-full" size="lg">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Buy via Telegram
        </Button>
      </CardContent>
    </Card>
  );
}
