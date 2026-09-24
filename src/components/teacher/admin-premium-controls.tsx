"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins, Gem, Loader2, MoreHorizontal, ShieldMinus, ShieldPlus } from "lucide-react";
import { toast } from "sonner";

import { grantPremiumAction, removePremiumAction, adminAdjustCoinsAction } from "@/actions/trial-management.actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CoinDialogMode = "grant" | "deduct" | null;

/** Phase 26 — Admin Premium Control. Root-only UI; the real gate lives server-side in each action, same as TrialActionsCell. */
export function AdminPremiumControls({ studentId, studentLabel }: { studentId: string; studentLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [coinDialog, setCoinDialog] = useState<CoinDialogMode>(null);
  const [coinAmount, setCoinAmount] = useState("");
  const [coinReason, setCoinReason] = useState("");

  function runGrantPremium() {
    startTransition(async () => {
      const result = await grantPremiumAction(studentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Premium granted to ${studentLabel}.`);
      router.refresh();
    });
  }

  function runRemovePremium() {
    setConfirmRemove(false);
    startTransition(async () => {
      const result = await removePremiumAction(studentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Premium removed from ${studentLabel}.`);
      router.refresh();
    });
  }

  function runCoinAdjustment() {
    const parsed = Number(coinAmount);
    if (!coinAmount || Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      toast.error("Enter a positive whole number of coins.");
      return;
    }
    const signedAmount = coinDialog === "deduct" ? -parsed : parsed;
    setCoinDialog(null);
    startTransition(async () => {
      const result = await adminAdjustCoinsAction(studentId, signedAmount, coinReason);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${coinDialog === "deduct" ? "Removed" : "Added"} ${parsed} coins ${coinDialog === "deduct" ? "from" : "to"} ${studentLabel}.`);
      setCoinAmount("");
      setCoinReason("");
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-3.5" />}
            Admin
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={runGrantPremium}>
            <ShieldPlus className="size-4" /> Grant Premium (30 days)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmRemove(true)} variant="destructive">
            <ShieldMinus className="size-4" /> Remove Premium
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCoinDialog("grant")}>
            <Coins className="size-4" /> Add Coins
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCoinDialog("deduct")} variant="destructive">
            <Coins className="size-4" /> Remove Coins
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gem className="size-4.5" /> Remove Premium?
            </DialogTitle>
            <DialogDescription>
              This ends {studentLabel}&apos;s Premium access immediately. Their subscription history is kept, not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={runRemovePremium}>
              Remove Premium
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={coinDialog != null} onOpenChange={(open) => !open && setCoinDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{coinDialog === "deduct" ? "Remove coins" : "Add coins"}</DialogTitle>
            <DialogDescription>
              {coinDialog === "deduct" ? `Deduct coins from ${studentLabel}'s wallet.` : `Grant coins to ${studentLabel}'s wallet.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="coin-amount">Amount</Label>
              <Input id="coin-amount" type="number" min={1} value={coinAmount} onChange={(e) => setCoinAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coin-reason">Reason (optional)</Label>
              <Textarea id="coin-reason" rows={2} value={coinReason} onChange={(e) => setCoinReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={runCoinAdjustment}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
