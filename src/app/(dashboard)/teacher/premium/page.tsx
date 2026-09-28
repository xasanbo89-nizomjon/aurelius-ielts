import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock, Gem, XCircle } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { listPremiumRequestsForRoot } from "@/lib/premium-requests";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PremiumRequestActions } from "@/components/teacher/premium-request-actions";

export const metadata: Metadata = { title: "Premium Requests" };

export default async function TeacherPremiumPage() {
  const { profile } = await requireTeacherProfile();
  if (!profile.isRootTeacher) redirect("/teacher/dashboard");

  const requests = await listPremiumRequestsForRoot();
  const pending = requests.filter((r) => r.status === "PENDING");
  const approved = requests.filter((r) => r.status === "APPROVED");
  const rejected = requests.filter((r) => r.status === "REJECTED");

  return (
    <>
      <PageHeader title="Premium Requests" description="Real Telegram purchase requests — approve to activate Premium instantly, no payment gateway involved." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value={String(pending.length)} icon={Clock} />
        <StatCard label="Approved" value={String(approved.length)} icon={CheckCircle2} />
        <StatCard label="Rejected" value={String(rejected.length)} icon={XCircle} />
      </div>

      <section className="space-y-4">
        <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
          <Clock className="text-accent size-5" aria-hidden="true" /> Pending Requests
        </h2>
        {pending.length === 0 ? (
          <EmptyState icon={Gem} title="No pending requests" description="New Telegram purchase requests will show up here." />
        ) : (
          <div className="space-y-3">
            {pending.map((request) => (
              <Card key={request.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Link href={`/teacher/students/${request.studentId}`} className="text-sm font-medium hover:underline">
                      {request.studentName ?? request.studentEmail}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {request.planTitle} · {request.priceLabel} · Requested {request.createdAt.toLocaleString()}
                    </p>
                  </div>
                  <PremiumRequestActions requestId={request.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
            <CheckCircle2 className="text-success size-5" aria-hidden="true" /> Approved
          </h2>
          {approved.length === 0 ? (
            <p className="text-muted-foreground text-sm">No approved requests yet.</p>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent approvals</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {approved.slice(0, 10).map((request) => (
                    <li key={request.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{request.studentName ?? request.studentEmail}</span>
                      <Badge variant="success">{request.planTitle}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
            <XCircle className="text-destructive size-5" aria-hidden="true" /> Rejected
          </h2>
          {rejected.length === 0 ? (
            <p className="text-muted-foreground text-sm">No rejected requests yet.</p>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent rejections</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {rejected.slice(0, 10).map((request) => (
                    <li key={request.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{request.studentName ?? request.studentEmail}</span>
                      <Badge variant="destructive">{request.planTitle}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
