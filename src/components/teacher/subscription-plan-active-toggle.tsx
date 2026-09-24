"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { setSubscriptionPlanActiveAction } from "@/actions/subscription-plans.actions";
import { Switch } from "@/components/ui/switch";

export function SubscriptionPlanActiveToggle({ planId, isActive }: { planId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleChange(checked: boolean) {
    startTransition(async () => {
      const result = await setSubscriptionPlanActiveAction(planId, checked);
      if (!result.success) toast.error(result.error);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {pending && <Loader2 className="text-muted-foreground size-3.5 animate-spin" />}
      <Switch checked={isActive} onCheckedChange={handleChange} disabled={pending} />
    </div>
  );
}
