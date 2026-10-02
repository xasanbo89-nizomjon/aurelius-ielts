"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Layers, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createBulkMockAccessCodesAction,
  createMockAccessCodeAction,
  deleteMockAccessCodeAction,
  setMockAccessCodeActiveAction,
  updateMockAccessCodeExpiryAction,
  updateMockAccessCodeMaxRedemptionsAction,
} from "@/actions/mock-access-codes.actions";
import type { StudentOption } from "@/lib/teacher-students";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/empty-state";

export type MockAccessCodeRow = {
  id: string;
  code: string;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  assignedStudentName: string | null;
  redeemedByStudentName: string | null;
  redeemedAt: Date | null;
  /** How many different students may redeem the code — null = unlimited. */
  maxRedemptions: number | null;
  redemptionCount: number;
};

/** "" / "unlimited" = no cap; otherwise a whole number >= 1. Returns undefined for input that isn't valid. */
function parseUsesInput(value: string): number | null | undefined {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "" || trimmed === "unlimited") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : undefined;
}

function usesLabel(row: MockAccessCodeRow): string {
  return row.maxRedemptions === null ? `${row.redemptionCount} / ∞` : `${row.redemptionCount} / ${row.maxRedemptions}`;
}

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date | null {
  return value.trim() ? new Date(`${value}T23:59:59`) : null;
}

type DerivedStatus = "active" | "inactive" | "expired" | "used";

function deriveStatus(row: MockAccessCodeRow): DerivedStatus {
  if (!row.isActive) return "inactive";
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return "expired";
  const usedUp = row.maxRedemptions !== null && row.redemptionCount >= row.maxRedemptions;
  if (usedUp || (row.maxRedemptions === 1 && row.redeemedByStudentName)) return "used";
  return "active";
}

const STATUS_LABEL: Record<DerivedStatus, string> = { active: "Active", inactive: "Deactivated", expired: "Expired", used: "Used up" };
const STATUS_VARIANT: Record<DerivedStatus, "success" | "outline" | "destructive" | "accent"> = {
  active: "success",
  inactive: "outline",
  expired: "destructive",
  used: "accent",
};

function copyCode(code: string) {
  navigator.clipboard
    .writeText(code)
    .then(() => toast.success(`${code} copied.`))
    .catch(() => toast.error("Could not copy — select and copy manually."));
}

function GenerateCodesCard({ fullMockTestId, students }: { fullMockTestId: string; students: StudentOption[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [assignedStudentId, setAssignedStudentId] = useState("any");
  const [bulkCount, setBulkCount] = useState("10");
  const [expiresAt, setExpiresAt] = useState("");
  const [uses, setUses] = useState("1");
  const [pending, startTransition] = useTransition();
  const [bulkResult, setBulkResult] = useState<string[] | null>(null);

  // A code pre-assigned to one student is always single-student; the control only applies to unassigned (shared / bulk) codes.
  const usesApplies = mode === "bulk" || assignedStudentId === "any";

  function generate() {
    const maxRedemptions = usesApplies ? parseUsesInput(uses) : 1;
    if (maxRedemptions === undefined) {
      toast.error('Uses must be a whole number of at least 1, or "unlimited".');
      return;
    }

    startTransition(async () => {
      const expiry = parseDateInput(expiresAt);
      if (mode === "single") {
        const result = await createMockAccessCodeAction(fullMockTestId, {
          assignedStudentId: assignedStudentId === "any" ? undefined : assignedStudentId,
          expiresAt: expiry ?? undefined,
          maxRedemptions,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success(`Code ${result.code} created.`);
        router.refresh();
      } else {
        const count = Number(bulkCount) || 0;
        const result = await createBulkMockAccessCodesAction(fullMockTestId, { count, expiresAt: expiry ?? undefined, maxRedemptions });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        setBulkResult(result.codes ?? []);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant={mode === "single" ? "default" : "outline"} onClick={() => setMode("single")}>
            <Plus className="size-3.5" /> One code
          </Button>
          <Button type="button" size="sm" variant={mode === "bulk" ? "default" : "outline"} onClick={() => setMode("bulk")}>
            <Layers className="size-3.5" /> Bulk codes
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {mode === "single" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Assign to student (optional)</Label>
              <Select value={assignedStudentId} onValueChange={setAssignedStudentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any student (unassigned)</SelectItem>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name ?? s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">How many codes</Label>
              <Input type="number" min={1} max={200} value={bulkCount} onChange={(event) => setBulkCount(event.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Students who can use it</Label>
            <Input
              value={usesApplies ? uses : "1"}
              onChange={(event) => setUses(event.target.value)}
              disabled={!usesApplies}
              placeholder="1, 30 or unlimited"
              aria-describedby="uses-help"
            />
            <p id="uses-help" className="text-muted-foreground text-[11px]">
              {usesApplies ? "1 = one student (default). A bigger number or “unlimited” makes a shared class code." : "A code assigned to a student is for that student only."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Expires (optional)</Label>
            <Input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </div>

          <div className="flex items-end">
            <Button onClick={generate} disabled={pending} className="w-full">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {mode === "single" ? "Generate code" : "Generate codes"}
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={bulkResult != null} onOpenChange={(open) => !open && setBulkResult(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{bulkResult?.length} codes generated</DialogTitle>
            <DialogDescription>Hand these out — each code can be used by the number of students you set (one student by default).</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm">
            {bulkResult?.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => copyCode(code)}
                className="bg-secondary/50 hover:bg-secondary flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors"
              >
                {code}
                <Copy className="size-3.5 shrink-0" />
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (bulkResult) copyCode(bulkResult.join("\n"));
              }}
            >
              <Copy className="size-3.5" /> Copy all
            </Button>
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ExpiryEditor({ fullMockTestId, row }: { fullMockTestId: string; row: MockAccessCodeRow }) {
  const [value, setValue] = useState(toDateInputValue(row.expiresAt));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateMockAccessCodeExpiryAction(row.id, fullMockTestId, { expiresAt: parseDateInput(value) });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Expiration updated.");
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Input type="date" value={value} onChange={(event) => setValue(event.target.value)} className="h-8 w-36 text-xs" />
      <Button size="sm" variant="ghost" className="h-8" onClick={save} disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
      </Button>
    </div>
  );
}

function UsesEditor({ fullMockTestId, row }: { fullMockTestId: string; row: MockAccessCodeRow }) {
  const [value, setValue] = useState(row.maxRedemptions === null ? "unlimited" : String(row.maxRedemptions));
  const [pending, startTransition] = useTransition();
  const locked = row.assignedStudentName != null;

  function save() {
    const parsed = parseUsesInput(value);
    if (parsed === undefined) {
      toast.error('Uses must be a whole number of at least 1, or "unlimited".');
      return;
    }
    startTransition(async () => {
      const result = await updateMockAccessCodeMaxRedemptionsAction(row.id, fullMockTestId, { maxRedemptions: parsed });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Updated.");
    });
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">{usesLabel(row)}</span>
      <Input value={value} onChange={(event) => setValue(event.target.value)} disabled={locked} className="h-8 w-24 text-xs" aria-label={`Students who can use ${row.code}`} />
      <Button size="sm" variant="ghost" className="h-8" onClick={save} disabled={pending || locked}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
      </Button>
    </div>
  );
}

export function MockAccessCodesManager({
  fullMockTestId,
  students,
  codes,
}: {
  fullMockTestId: string;
  students: StudentOption[];
  codes: MockAccessCodeRow[];
}) {
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MockAccessCodeRow | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    if (!search.trim()) return codes;
    const q = search.trim().toLowerCase();
    return codes.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.assignedStudentName?.toLowerCase().includes(q) ||
        c.redeemedByStudentName?.toLowerCase().includes(q)
    );
  }, [codes, search]);

  function toggleActive(row: MockAccessCodeRow) {
    startTransition(async () => {
      const result = await setMockAccessCodeActiveAction(row.id, fullMockTestId, !row.isActive);
      if (!result.success) toast.error(result.error);
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deleteMockAccessCodeAction(id, fullMockTestId);
      if (!result.success) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-5">
      <GenerateCodesCard fullMockTestId={fullMockTestId} students={students} />

      <div className="relative w-full max-w-xs">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" aria-hidden="true" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by code or student…"
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Layers} title="No access codes yet" description="Generate a code above to let students start this mock." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Redeemed by</TableHead>
              <TableHead>Uses</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const status = deriveStatus(row);
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <button type="button" onClick={() => copyCode(row.code)} className="flex items-center gap-1.5 font-mono text-xs hover:underline">
                      {row.code} <Copy className="size-3" />
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{row.assignedStudentName ?? "Any student"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {row.redeemedByStudentName ? (row.redemptionCount > 1 ? `${row.redeemedByStudentName} +${row.redemptionCount - 1}` : row.redeemedByStudentName) : "—"}
                  </TableCell>
                  <TableCell>
                    <UsesEditor fullMockTestId={fullMockTestId} row={row} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <ExpiryEditor fullMockTestId={fullMockTestId} row={row} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(row)} disabled={pending}>
                        {row.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(row)}
                        disabled={pending}
                        aria-label={`Delete ${row.code}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.code}?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. A code that&apos;s already been redeemed can&apos;t be deleted — deactivate it instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
