import type { Metadata } from "next";
import { CreditCard } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";

export const metadata: Metadata = { title: "Payments" };

const PAGE_SIZE = 10;

const STATUS_VARIANT = {
  PENDING: "outline",
  COMPLETED: "success",
  FAILED: "destructive",
  REFUNDED: "outline",
} as const;

export default async function TeacherPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const where = {
    student: {
      teacherId: profile.id,
      ...(q ? { user: { name: { contains: q, mode: "insensitive" as const } } } : {}),
    },
  };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { student: { include: { user: { select: { name: true } } } } },
    }),
    prisma.payment.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/teacher/payments?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Payments"
        description="Transactions from students enrolled under your account."
        actions={<SearchInput name="q" placeholder="Search by student…" defaultValue={q} />}
      />

      {payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={q ? "No matching payments" : "No payments yet"}
          description={
            q
              ? `No payments found for "${q}". Try a different search.`
              : "Payments made by your students for subscriptions will appear here."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">{payment.student.user.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {payment.currency} {payment.amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{payment.providerType ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {payment.createdAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[payment.status]}>{payment.status.toLowerCase()}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </>
  );
}
