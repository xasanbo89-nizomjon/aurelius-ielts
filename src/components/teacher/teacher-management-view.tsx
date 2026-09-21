"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { addTeacherAction, removeTeacherAction } from "@/actions/teacher-management.actions";
import type { TeacherAllowlistRow } from "@/lib/teacher-access";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";

export function TeacherManagementView({
  rootEmail,
  teachers,
}: {
  rootEmail: string;
  teachers: TeacherAllowlistRow[];
}) {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  function handleAdd() {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Enter an email address.");
      return;
    }
    startTransition(async () => {
      const result = await addTeacherAction(trimmed);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.promoted ? "Teacher added — their existing account was upgraded immediately." : "Teacher authorized."
      );
      setEmail("");
    });
  }

  function handleRemove(targetEmail: string) {
    setRemovingEmail(targetEmail);
    startTransition(async () => {
      const result = await removeTeacherAction(targetEmail);
      setRemovingEmail(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Teacher access removed.");
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="text-accent size-4.5" aria-hidden="true" /> Root administrator
          </CardTitle>
          <CardDescription>Permanent — always a teacher, and not managed here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="accent">{rootEmail}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a teacher</CardTitle>
          <CardDescription>
            They become a teacher immediately if they already have an account, or the next time they sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="teacher-email">Email</Label>
            <Input
              id="teacher-email"
              type="email"
              placeholder="teacher@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={pending}>
            {pending && !removingEmail ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Add teacher
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Authorized teachers</h2>
        {teachers.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No additional teachers yet"
            description="Teachers you add by email will appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Account status</TableHead>
                <TableHead>Added by</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="sr-only">Remove</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((teacher) => (
                <TableRow key={teacher.id}>
                  <TableCell className="font-medium">{teacher.email}</TableCell>
                  <TableCell>
                    <Badge variant={teacher.hasAccount ? "success" : "outline"}>
                      {teacher.hasAccount ? "Active" : "Pending sign-in"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{teacher.addedByName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{teacher.createdAt.toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${teacher.email}`}
                      onClick={() => handleRemove(teacher.email)}
                      disabled={pending && removingEmail === teacher.email}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
