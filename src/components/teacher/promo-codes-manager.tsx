"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Power, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deletePromoCodeAction, setPromoCodeActiveAction } from "@/actions/promo-codes.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { PromoCodeEditorDialog, type ExistingPromoCode } from "@/components/teacher/promo-code-editor-dialog";

export type PromoCodeRow = ExistingPromoCode & {
  usedCount: number;
  isActive: boolean;
};

export function PromoCodesManager({ promoCodes }: { promoCodes: PromoCodeRow[] }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCodeRow | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<PromoCodeRow | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setEditing(undefined);
    setEditorOpen(true);
  }

  function openEdit(code: PromoCodeRow) {
    setEditing(code);
    setEditorOpen(true);
  }

  function toggleActive(code: PromoCodeRow) {
    startTransition(async () => {
      const result = await setPromoCodeActiveAction(code.id, !code.isActive);
      if (!result.success) toast.error(result.error);
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deletePromoCodeAction(id);
      if (!result.success) toast.error(result.error);
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" /> Create promo code
        </Button>
      </div>

      {promoCodes.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No promo codes yet"
          description="Create a code to offer discounts or bonus trial days to your students."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Create promo code
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Bonus Days</TableHead>
              <TableHead>Usage Count</TableHead>
              <TableHead>Usage Limit</TableHead>
              <TableHead>Expiry Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promoCodes.map((code) => (
              <TableRow key={code.id}>
                <TableCell className="font-mono font-medium">{code.code}</TableCell>
                <TableCell className="text-muted-foreground">{code.value}%</TableCell>
                <TableCell className="text-muted-foreground">{code.bonusTrialDays}</TableCell>
                <TableCell className="text-muted-foreground">{code.usedCount}</TableCell>
                <TableCell className="text-muted-foreground">{code.maxUses ?? "Unlimited"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {code.expiresAt ? code.expiresAt.toLocaleDateString() : "No expiry"}
                </TableCell>
                <TableCell>
                  <Badge variant={code.isActive ? "success" : "outline"}>
                    {code.isActive ? "Active" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(code)}
                      aria-label={`Edit ${code.code}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleActive(code)}
                      disabled={pending}
                      aria-label={code.isActive ? `Disable ${code.code}` : `Enable ${code.code}`}
                    >
                      <Power className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(code)}
                      disabled={pending}
                      aria-label={`Delete ${code.code}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <PromoCodeEditorDialog open={editorOpen} onOpenChange={setEditorOpen} existingPromoCode={editing} />

      <Dialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.code}?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. Codes with real redemptions can&apos;t be deleted — disable them instead.
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
    </section>
  );
}
