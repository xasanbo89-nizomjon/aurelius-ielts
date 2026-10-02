"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteImportedTestAction } from "@/actions/pdf-test-import.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ImportStatus = "UPLOADED" | "PARSING" | "PARSED" | "FAILED" | "IMPORTED";

export type ImportListRow = {
  id: string;
  type: "READING" | "LISTENING";
  title: string | null;
  sourceFileName: string;
  status: ImportStatus;
  errorMessage: string | null;
  /** The real test this import became (IMPORTED only). */
  createdTest: { id: string; title: string; attemptCount: number; ownerMockTitle: string | null } | null;
};

const STATUS_VARIANT = { UPLOADED: "outline", PARSING: "outline", PARSED: "accent", FAILED: "destructive", IMPORTED: "success" } as const;
const STATUS_LABEL = { UPLOADED: "Uploaded", PARSING: "Analyzing…", PARSED: "Ready for review", FAILED: "Failed", IMPORTED: "Imported" } as const;

/**
 * Phase B — the recent-imports list with a real delete: one confirmation that says exactly what goes (the staged questions and the uploaded PDF) and, for an import that already became a test, what does NOT (the test) unless the teacher opts in.
 */
export function PdfTestImportList({ rows }: { rows: ImportListRow[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<ImportListRow | null>(null);
  const [alsoDeleteTest, setAlsoDeleteTest] = useState(false);
  const [alsoDeleteAttempts, setAlsoDeleteAttempts] = useState(false);
  const [pending, startTransition] = useTransition();

  function open(row: ImportListRow) {
    setTarget(row);
    setAlsoDeleteTest(false);
    setAlsoDeleteAttempts(false);
  }

  function confirmDelete() {
    if (!target) return;
    const row = target;
    const options = { alsoDeleteTest, deleteAttempts: alsoDeleteTest && alsoDeleteAttempts };
    setTarget(null);
    startTransition(async () => {
      const result = await deleteImportedTestAction(row.id, options);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      toast.success(alsoDeleteTest ? "Import and test deleted." : "Import deleted.");
      router.refresh();
    });
  }

  const created = target?.createdTest ?? null;
  const testIsPackageOwned = Boolean(created?.ownerMockTitle);

  return (
    <>
      <div className="space-y-2">
        {rows.map((row) => (
          <Card key={row.id} className="transition-shadow hover:shadow-soft-lg">
            <CardContent className="flex items-center justify-between gap-3 py-3.5">
              <Link href={`/teacher/tests/import/${row.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {row.title || row.sourceFileName}
                    <span className="text-muted-foreground ml-2 text-xs font-normal">{row.type === "LISTENING" ? "Listening" : "Reading"}</span>
                  </p>
                  <p className="text-muted-foreground truncate text-xs">{row.status === "FAILED" && row.errorMessage ? row.errorMessage : row.sourceFileName}</p>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Delete import ${row.title || row.sourceFileName}`}
                  disabled={pending}
                  onClick={() => open(row)}
                >
                  {pending && target?.id === row.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!target} onOpenChange={(next) => !next && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this import?</DialogTitle>
            <DialogDescription>
              {target?.status === "FAILED"
                ? "This discards the failed import and its uploaded PDF."
                : "This discards everything detected from the PDF (passages, questions, answers) and the uploaded PDF itself."}{" "}
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>

          {created && (
            <div className="border-border/70 space-y-2.5 rounded-xl border p-3.5 text-sm">
              <p>
                This import already became the test <strong>{created.title}</strong>. That test is <strong>not</strong> deleted unless you tick the box below.
              </p>
              {testIsPackageOwned ? (
                <p className="text-muted-foreground text-xs">
                  It is one section of the Full Mock &ldquo;{created.ownerMockTitle}&rdquo;, so it can only be deleted together with that mock.
                </p>
              ) : (
                <>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input type="checkbox" className="mt-0.5 size-4" checked={alsoDeleteTest} onChange={(event) => setAlsoDeleteTest(event.target.checked)} />
                    <span>Also delete that test (its passages, questions, answer key and audio files)</span>
                  </label>
                  {alsoDeleteTest && created.attemptCount > 0 && (
                    <label className="border-destructive/30 bg-destructive/5 flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5">
                      <input type="checkbox" className="mt-0.5 size-4" checked={alsoDeleteAttempts} onChange={(event) => setAlsoDeleteAttempts(event.target.checked)} />
                      <span>
                        <strong>
                          {created.attemptCount} student attempt{created.attemptCount === 1 ? "" : "s"}
                        </strong>{" "}
                        on it will be permanently deleted too.
                      </span>
                    </label>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete} disabled={alsoDeleteTest && (created?.attemptCount ?? 0) > 0 && !alsoDeleteAttempts}>
              {alsoDeleteTest ? "Delete import and test" : "Delete import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
