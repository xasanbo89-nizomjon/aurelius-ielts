import type { Metadata } from "next";
import { Mic } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Speaking" };

export default async function StudentSpeakingPage() {
  await requireStudentProfile();

  return (
    <>
      <PageHeader title="Speaking" description="Practice your speaking skills for the IELTS exam." />

      <Card className="py-10">
        <CardContent className="mx-auto max-w-md space-y-4 text-center">
          <span className="bg-secondary text-accent mx-auto flex size-14 items-center justify-center rounded-2xl">
            <Mic className="size-7" strokeWidth={1.5} />
          </span>
          <div className="space-y-1.5">
            <h2 className="font-display text-lg font-medium">Speaking practice is being rebuilt</h2>
            <p className="text-muted-foreground text-sm">
              Teacher-created speaking questions, recordings and scored reviews are on the way in a future update.
              Check back soon.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
