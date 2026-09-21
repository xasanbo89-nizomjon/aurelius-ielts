"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createPromoCodeAction, updatePromoCodeAction } from "@/actions/promo-codes.actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ExistingPromoCode = {
  id: string;
  code: string;
  value: number;
  bonusTrialDays: number;
  maxUses: number | null;
  expiresAt: Date | null;
};

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function PromoCodeEditorDialog({
  open,
  onOpenChange,
  existingPromoCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPromoCode?: ExistingPromoCode;
}) {
  const [discountPercent, setDiscountPercent] = useState("");
  const [bonusTrialDays, setBonusTrialDays] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDiscountPercent(existingPromoCode ? String(existingPromoCode.value) : "");
    setBonusTrialDays(existingPromoCode ? String(existingPromoCode.bonusTrialDays) : "0");
    setMaxUses(existingPromoCode?.maxUses != null ? String(existingPromoCode.maxUses) : "");
    setExpiresAt(toDateInputValue(existingPromoCode?.expiresAt ?? null));
  }, [open, existingPromoCode]);

  async function handleSubmit() {
    const discount = Number(discountPercent);
    const bonus = Number(bonusTrialDays);

    if (discountPercent.trim() === "" || Number.isNaN(discount) || discount < 0 || discount > 100) {
      toast.error("Enter a discount between 0 and 100.");
      return;
    }
    if (bonusTrialDays.trim() === "" || Number.isNaN(bonus) || bonus < 0 || bonus > 365) {
      toast.error("Enter a valid number of bonus trial days (0–365).");
      return;
    }
    if (maxUses.trim() && (!Number.isInteger(Number(maxUses)) || Number(maxUses) < 1)) {
      toast.error("Usage limit must be a whole number of 1 or more.");
      return;
    }

    setSubmitting(true);
    const input = {
      discountPercent: discount,
      bonusTrialDays: bonus,
      maxUses: maxUses.trim() ? Number(maxUses) : null,
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`) : null,
    };
    const result = existingPromoCode
      ? await updatePromoCodeAction(existingPromoCode.id, input)
      : await createPromoCodeAction(input);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(existingPromoCode ? "Promo code updated." : "Promo code created.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existingPromoCode ? `Edit ${existingPromoCode.code}` : "Create promo code"}</DialogTitle>
          <DialogDescription>
            {existingPromoCode
              ? "The code itself can't be changed — only its terms."
              : "The code (AZ + 6 random characters) is generated automatically — you only set the terms."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="discount">Discount %</Label>
              <Input
                id="discount"
                type="number"
                min={0}
                max={100}
                value={discountPercent}
                onChange={(event) => setDiscountPercent(event.target.value)}
                placeholder="20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bonus-days">Bonus trial days</Label>
              <Input
                id="bonus-days"
                type="number"
                min={0}
                max={365}
                value={bonusTrialDays}
                onChange={(event) => setBonusTrialDays(event.target.value)}
                placeholder="7"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="max-uses">Usage limit</Label>
              <Input
                id="max-uses"
                type="number"
                min={1}
                value={maxUses}
                onChange={(event) => setMaxUses(event.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expires-at">Expiry date</Label>
              <Input
                id="expires-at"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {existingPromoCode ? "Save changes" : "Create code"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
