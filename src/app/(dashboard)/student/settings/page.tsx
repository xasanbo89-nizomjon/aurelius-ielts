import type { Metadata } from "next";
import { Mail, Shield, User as UserIcon, CalendarClock } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getSubscriptionSummary } from "@/lib/subscription";
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_VARIANTS } from "@/lib/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Settings" };

export default async function StudentSettingsPage() {
  const { user, profile } = await requireStudentProfile();
  const subscription = await getSubscriptionSummary(profile.id);

  return (
    <>
      <PageHeader title="Settings" description="Your account details. Update your name, photo and goals from My Profile." />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Managed by Aurelius IELTS — contact your teacher if anything here looks wrong.</CardDescription>
        </CardHeader>
        <CardContent className="divide-border/70 divide-y">
          <div className="flex items-center gap-3 py-3">
            <UserIcon className="text-muted-foreground size-4.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs">Name</p>
              <p className="truncate text-sm font-medium">{user.name ?? "Not set"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-3">
            <Mail className="text-muted-foreground size-4.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs">Email</p>
              <p className="truncate text-sm font-medium">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-3">
            <Shield className="text-muted-foreground size-4.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs">Plan</p>
              <Badge variant={SUBSCRIPTION_STATUS_VARIANTS[subscription.status]}>
                {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 py-3">
            <CalendarClock className="text-muted-foreground size-4.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs">Member since</p>
              <p className="text-sm font-medium">{user.createdAt.toLocaleDateString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
