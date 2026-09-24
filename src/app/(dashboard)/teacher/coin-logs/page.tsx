import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { FilterPills } from "@/components/dashboard/filter-pills";

export const metadata: Metadata = { title: "Coin Logs" };

const PAGE_SIZE = 20;

const FILTERS = [
  { value: "all", label: "All" },
  { value: "admin", label: "Admin Only" },
] as const;

const TYPE_LABEL: Record<string, string> = {
  STUDY_TIME: "Study Time",
  STREAK_BONUS: "Streak Bonus",
  ACHIEVEMENT: "Achievement",
  REDEMPTION: "Premium Redemption",
  WEEKLY_BONUS: "Weekly Bonus",
  MONTHLY_BONUS: "Monthly Bonus",
  ADMIN_GRANT: "Admin Grant",
  ADMIN_DEDUCT: "Admin Deduction",
};

export default async function TeacherCoinLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  if (!profile.isRootTeacher) redirect("/teacher/dashboard");

  const { filter: filterParam, page: pageParam } = await searchParams;
  const filter = filterParam === "admin" ? "admin" : "all";
  const page = Math.max(1, Number(pageParam) || 1);

  const where: Prisma.CoinTransactionWhereInput =
    filter === "admin" ? { type: { in: ["ADMIN_GRANT", "ADMIN_DEDUCT"] } } : {};

  const [logs, total] = await Promise.all([
    prisma.coinTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { student: { select: { id: true, user: { select: { name: true, email: true } } } } },
    }),
    prisma.coinTransaction.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const buildHref = (p: number) => `/teacher/coin-logs?filter=${filter}&page=${p}`;

  return (
    <>
      <PageHeader title="Coin Logs" description="Every real coin transaction on the platform, root-only." />

      <FilterPills
        label="Filter"
        activeValue={filter}
        options={FILTERS.map((f) => ({ value: f.value, label: f.label, href: `/teacher/coin-logs?filter=${f.value}` }))}
      />

      {logs.length === 0 ? (
        <EmptyState icon={Coins} title="No coin transactions yet" description="Real student coin activity will show up here." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">
                    <Link href={`/teacher/students/${log.student.id}`} className="hover:underline">
                      {log.student.user.name ?? log.student.user.email}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={log.type.startsWith("ADMIN") ? "accent" : "outline"}>{TYPE_LABEL[log.type] ?? log.type}</Badge>
                  </TableCell>
                  <TableCell className={log.amount >= 0 ? "text-success" : "text-destructive"}>
                    {log.amount >= 0 ? "+" : ""}
                    {log.amount}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">{log.description}</TableCell>
                  <TableCell className="text-muted-foreground">{log.createdAt.toLocaleString()}</TableCell>
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
