"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Ticket } from "lucide-react";
import { toast } from "sonner";

import { redeemPromoCodeAction } from "@/actions/subscription.actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function RedeemPromoCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("Enter a promo code.");
      return;
    }

    startTransition(async () => {
      const result = await redeemPromoCodeAction(trimmed);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const parts: string[] = [];
      if (result.bonusTrialDays > 0) parts.push(`+${result.bonusTrialDays} trial days`);
      if (result.discountPercent) parts.push(`${result.discountPercent}% discount saved`);
      toast.success(parts.length > 0 ? `Applied: ${parts.join(" · ")}` : "Promo code applied.");
      setCode("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket className="text-accent size-4.5" aria-hidden="true" /> Have a Promo Code?
        </CardTitle>
        <CardDescription>Redeem a code from your teacher for bonus trial days or a discount.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="AZ7XK29Q"
            className="max-w-48 font-mono uppercase"
            maxLength={32}
            disabled={pending}
          />
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Apply
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
