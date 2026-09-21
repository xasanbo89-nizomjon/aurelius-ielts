"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { redeemPremiumAction } from "@/actions/coins.actions";
import { PREMIUM_REDEMPTION_COST, PREMIUM_REDEMPTION_DAYS } from "@/lib/coin-economy-constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function RedeemPremiumButton({ balance }: { balance: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const canRedeem = balance >= PREMIUM_REDEMPTION_COST;

  async function handleRedeem() {
    setRedeeming(true);
    const result = await redeemPremiumAction();
    setRedeeming(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setOpen(false);
    toast.success(`Premium activated until ${result.newExpiryDate.toLocaleDateString()}.`);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!canRedeem}>
        Redeem Premium
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem {PREMIUM_REDEMPTION_COST} coins for Premium?</DialogTitle>
            <DialogDescription>
              This will deduct {PREMIUM_REDEMPTION_COST} coins from your wallet and grant {PREMIUM_REDEMPTION_DAYS} days of
              Premium access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={redeeming}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleRedeem} disabled={redeeming}>
              {redeeming && <Loader2 className="size-4 animate-spin" />}
              Redeem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
