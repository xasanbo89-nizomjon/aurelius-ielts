import Link from "next/link";
import { Lock } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Phase 24 — the shared paywall screen for a locked premium feature
 * (Writing, Speaking, Leveled Articles, Study Coach, AI Explain More, AI
 * Analysis). Whether a student sees this is decided server-side by the
 * calling page via hasActiveAccess() — the same real TRIAL/ACTIVE check
 * that already gates exam start/submit, so a student's existing real trial
 * or paid time keeps working here exactly as it does there.
 */
export function PremiumLockScreen({ feature }: { feature: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md py-8">
        <CardContent className="space-y-5 text-center">
          <span className="bg-secondary text-accent mx-auto flex size-14 items-center justify-center rounded-2xl">
            <Lock className="size-7" strokeWidth={1.5} />
          </span>
          <div className="space-y-2">
            <h1 className="font-display text-xl font-medium tracking-tight">{feature} is a Premium feature</h1>
            <p className="text-muted-foreground text-sm">
              Upgrade to Premium — or ask your teacher for access — to unlock {feature.toLowerCase()}. Cambridge Tests stay free either way.
            </p>
          </div>
          <Button asChild size="lg" className="w-full">
            <Link href="/student/subscription?upgrade=1">Upgrade to Premium</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
