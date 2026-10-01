import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, Gem, XCircle } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { listPremiumRequestsForStudent } from "@/lib/premium-requests";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata: Metadata = { title: "Premium Purchase History" };

const STATUS_META = {
  PENDING: { variant: "outline", icon: Clock, label: "Pending" },
  APPROVED: { variant: "success", icon: CheckCircle2, label: "Approved" },
  REJECTED: { variant: "destructive", icon: XCircle, label: "Rejected" },
} as const;

export default async function StudentPremiumHistoryPage() {
  const { profile } = await requireStudentProfile();
  const requests = await listPremiumRequestsForStudent(profile.id);

  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/student/premium">
          <ArrowLeft className="size-4" /> Back to Premium
        </Link>
      </Button>

      <PageHeader title="Purchase History" description="Every Premium purchase you've requested, and its real status." />

      {requests.length === 0 ? (
        <EmptyState icon={Gem} title="No purchase requests yet" description="Buy a plan from the Premium page to see it here." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card className="py-4">
              <CardContent className="space-y-0.5 text-center">
                <p className="text-muted-foreground text-xs font-medium">Total Purchases</p>
                <p className="font-display text-xl font-medium">{requests.length}</p>
              </CardContent>
            </Card>
            <Card className="py-4">
              <CardContent className="space-y-0.5 text-center">
                <p className="text-muted-foreground text-xs font-medium">Approved</p>
                <p className="font-display text-xl font-medium">{approvedCount}</p>
              </CardContent>
            </Card>
            <Card className="col-span-2 py-4 sm:col-span-1">
              <CardContent className="space-y-0.5 text-center">
                <p className="text-muted-foreground text-xs font-medium">Most Recent</p>
                <p className="font-display text-sm font-medium">{requests[0].planTitle}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="gap-0 py-2">
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Expiration Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => {
                    const meta = STATUS_META[request.status];
                    const StatusIcon = meta.icon;
                    return (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.planTitle}</TableCell>
                        <TableCell className="tabular-nums">{request.priceLabel}</TableCell>
                        <TableCell className="text-muted-foreground">{request.createdAt.toLocaleDateString()}</TableCell>
                        <TableCell className="text-muted-foreground">{request.expiresAt ? request.expiresAt.toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={meta.variant} className="flex w-fit items-center gap-1">
                            <StatusIcon className="size-3" aria-hidden="true" /> {meta.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
