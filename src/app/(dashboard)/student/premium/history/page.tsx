import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Gem } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { listPremiumRequestsForStudent } from "@/lib/premium-requests";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata: Metadata = { title: "Premium Purchase History" };

const STATUS_VARIANT = { PENDING: "outline", APPROVED: "success", REJECTED: "destructive" } as const;

export default async function StudentPremiumHistoryPage() {
  const { profile } = await requireStudentProfile();
  const requests = await listPremiumRequestsForStudent(profile.id);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/student/premium">
          <ArrowLeft className="size-4" /> Back to Premium
        </Link>
      </Button>

      <PageHeader title="Premium Purchase History" description="Every Telegram purchase request you've made, and its real status." />

      {requests.length === 0 ? (
        <EmptyState icon={Gem} title="No purchase requests yet" description="Buy a plan from the Premium page to see it here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium">{request.planTitle}</TableCell>
                <TableCell>{request.priceLabel}</TableCell>
                <TableCell className="text-muted-foreground">{request.createdAt.toLocaleDateString()}</TableCell>
                <TableCell className="text-muted-foreground">{request.expiresAt ? request.expiresAt.toLocaleDateString() : "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[request.status]}>{request.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
