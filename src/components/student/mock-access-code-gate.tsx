"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { redeemMockAccessCodeAction } from "@/actions/mock-access-codes.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Phase 51 — the student-facing half of the access-code gate. Purely a UI
 * convenience: the real enforcement is server-side in
 * startFullMockAttemptAction (src/actions/full-mock-attempts.actions.ts),
 * so this form existing (or not) never changes what a student can actually
 * start — it only changes what they see.
 */
export function MockAccessCodeGate({ fullMockTestId, redirectOnSuccess = true }: { fullMockTestId?: string; redirectOnSuccess?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      toast.error("Enter an access code.");
      return;
    }

    setSubmitting(true);
    const result = await redeemMockAccessCodeAction({ code });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Access code accepted.");
    if (redirectOnSuccess) {
      router.push(`/student/full-mock/${result.fullMockTestId}`);
    } else if (result.fullMockTestId === fullMockTestId) {
      router.refresh();
    } else {
      router.push(`/student/full-mock/${result.fullMockTestId}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5 text-left">
        <Label htmlFor="mock-access-code">Access code</Label>
        <div className="flex gap-2">
          <Input
            id="mock-access-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="MOCK-XXXXXX"
            className="font-mono uppercase"
            autoComplete="off"
            autoCapitalize="characters"
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Unlock
          </Button>
        </div>
      </div>
    </form>
  );
}
