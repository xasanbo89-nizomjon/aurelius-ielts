import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { SUBMITTED_TEXT, SUBMITTED_TITLE } from "@/lib/exam/result-visibility-rules";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Phase O - what a student sees after handing in a test whose results are hidden from them (the teacher's "Show results to students?" is No, or the test was a
 * section of a Full Mock). Nothing about the attempt is shown: no band, no score, no percentage, no right or wrong.
 */
export function SubmittedNotice({ back, children }: { back?: { href: string; label: string }; children?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6 sm:py-24">
      {children}
      <Card className="py-10" data-testid="test-submitted">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="text-success size-12" aria-hidden="true" />
          <h1 className="font-display text-2xl font-medium tracking-tight">{SUBMITTED_TITLE}</h1>
          <p className="text-muted-foreground max-w-sm text-sm">{SUBMITTED_TEXT}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {back && (
              <Button asChild variant="outline">
                <Link href={back.href}>{back.label}</Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/student/dashboard">Go to home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
