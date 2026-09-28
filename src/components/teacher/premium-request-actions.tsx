"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { approvePremiumRequestAction, rejectPremiumRequestAction } from "@/actions/premium-requests.actions";
import { Button } from "@/components/ui/button";

export function PremiumRequestActions({ requestId }: { requestId: string }) {
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);

  async function handle(action: "approve" | "reject") {
    setPending(action);
    const result = action === "approve" ? await approvePremiumRequestAction(requestId) : await rejectPremiumRequestAction(requestId);
    setPending(null);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(action === "approve" ? "Premium activated for this student." : "Request rejected.");
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={() => handle("approve")} disabled={pending != null}>
        {pending === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Approve
      </Button>
      <Button size="sm" variant="outline" onClick={() => handle("reject")} disabled={pending != null}>
        {pending === "reject" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
        Reject
      </Button>
    </div>
  );
}
