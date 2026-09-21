"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { completeOnboardingAction } from "@/actions/onboarding.actions";
import { Button } from "@/components/ui/button";

/**
 * Role is decided entirely server-side (the hardcoded root admin email, or
 * the database-backed teacher allowlist) — this is deliberately just a
 * confirmation step, never a "choose your role" picker.
 */
export function OnboardingWelcome({ name }: { name?: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleContinue() {
    startTransition(async () => {
      const result = await completeOnboardingAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.push(result.role === "TEACHER" ? "/teacher/dashboard" : "/student/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="space-y-7 text-center">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-medium tracking-tight">
          {name ? `Welcome, ${name.split(" ")[0]}` : "Welcome"}
        </h1>
        <p className="text-muted-foreground text-sm">Let&apos;s finish setting up your account.</p>
      </div>

      <Button size="lg" className="w-full" onClick={handleContinue} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Continue
      </Button>
    </div>
  );
}
