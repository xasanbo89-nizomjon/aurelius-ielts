"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Gem, Loader2, MoreHorizontal, ShieldMinus, ShieldPlus } from "lucide-react";
import { toast } from "sonner";

import { grantPremiumAction, removePremiumAction, cancelSubscriptionAction } from "@/actions/trial-management.actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Phase 48 — real duration tiers a root teacher can grant/extend by, matching the 3 real plans (1/3/6 months). */
const GRANT_DURATIONS = [
  { days: 30, label: "1 Month (30 days)" },
  { days: 90, label: "3 Months (90 days)" },
  { days: 180, label: "6 Months (180 days)" },
] as const;

/** Phase 26 — Admin Premium Control. Root-only UI; the real gate lives server-side in each action, same as TrialActionsCell. */
export function AdminPremiumControls({ studentId, studentLabel }: { studentId: string; studentLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [grantDays, setGrantDays] = useState("30");

  function runGrantPremium() {
    const days = Number(grantDays);
    setGrantDialogOpen(false);
    startTransition(async () => {
      const result = await grantPremiumAction(studentId, days);
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

  function runCancelSubscription() {
    setConfirmCancel(false);
    startTransition(async () => {
      const result = await cancelSubscriptionAction(studentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${studentLabel}'s subscription was cancelled.`);
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
          <DropdownMenuItem onSelect={() => setGrantDialogOpen(true)}>
            <ShieldPlus className="size-4" /> Grant / Extend Premium
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmRemove(true)} variant="destructive">
            <ShieldMinus className="size-4" /> Remove Premium
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmCancel(true)} variant="destructive">
            <Ban className="size-4" /> Cancel Subscription
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldPlus className="size-4.5" /> Grant / Extend Premium
            </DialogTitle>
            <DialogDescription>
              Activates Premium for {studentLabel}, or extends their current end date if they&apos;re already on an active
              paid plan — never a downgrade.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="grant-duration">Duration</Label>
            <Select value={grantDays} onValueChange={setGrantDays}>
              <SelectTrigger id="grant-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRANT_DURATIONS.map((d) => (
                  <SelectItem key={d.days} value={String(d.days)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={runGrantPremium}>Grant Premium</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="size-4.5" /> Cancel subscription?
            </DialogTitle>
            <DialogDescription>
              Marks {studentLabel}&apos;s subscription as CANCELLED (distinct from a natural expiry) and ends their Premium
              access immediately. Their subscription history is kept, not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep subscription</Button>
            </DialogClose>
            <Button variant="destructive" onClick={runCancelSubscription}>
              Cancel Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
