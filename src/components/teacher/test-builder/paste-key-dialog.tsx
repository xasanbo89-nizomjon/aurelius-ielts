"use client";

import { useMemo, useState } from "react";
import { ClipboardPaste } from "lucide-react";

import type { BuilderModel } from "@/lib/exam/builder-model";
import { parseAnswerKey, previewAnswerKey } from "@/lib/exam/answer-key-paste";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * "Paste the answer key": the whole key in one go ("1 TRUE 2 FALSE 3 NOT GIVEN 4 carnivorous 5 B ...", or one per line, "/" between alternatives).
 * Nothing is written while the teacher looks at the table of question -> type -> parsed answer; a mismatch (a "C" for a True / False / Not Given
 * statement, a "D" when the options are A-C, more words than the limit) is shown in red and is never written.
 */
export function PasteKeyDialog({ open, onOpenChange, model, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; model: BuilderModel; onApply: (text: string) => number }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseAnswerKey(text) : null), [text]);
  const preview = useMemo(() => (parsed ? previewAnswerKey(model, parsed) : null), [parsed, model]);
  const ok = preview?.rows.filter((r) => r.status === "ok").length ?? 0;
  const mismatches = preview?.rows.filter((r) => r.status === "mismatch").length ?? 0;
  const missing = preview?.rows.filter((r) => r.status === "missing").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" data-testid="paste-key-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="size-5" /> Paste the answer key
          </DialogTitle>
          <DialogDescription>
            Paste it as &quot;1 TRUE 2 FALSE 3 NOT GIVEN 4 carnivorous 5 B …&quot; or one answer per line. Use &quot;/&quot; between accepted alternatives (colour/color). Nothing is saved until you press Apply.
          </DialogDescription>
        </DialogHeader>

        <Textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder={"1 TRUE\n2 FALSE\n3 NOT GIVEN\n4 carnivorous\n5 B"} data-testid="paste-key-text" />

        {preview && parsed && (
          <div className="space-y-2" data-testid="paste-key-table">
            <p className="text-sm">
              <span className="text-success font-medium">{ok} ready</span>
              {mismatches > 0 && <span className="text-destructive font-medium"> · {mismatches} don&apos;t fit their question</span>}
              {missing > 0 && <span className="text-muted-foreground"> · {missing} not in the pasted key</span>}
              {preview.extra.length > 0 && <span className="text-muted-foreground"> · numbers with no question: {preview.extra.join(", ")}</span>}
            </p>
            {parsed.warnings.length > 0 && (
              <ul className="text-muted-foreground list-disc pl-5 text-xs">
                {parsed.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <div className="border-border/70 max-h-80 overflow-y-auto rounded-xl border">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5">Question</th>
                    <th className="px-2 py-1.5">Type</th>
                    <th className="px-2 py-1.5">Pasted</th>
                    <th className="px-2 py-1.5">Will be stored as</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.number} className={cn("border-border/50 border-t", row.status === "mismatch" && "bg-destructive/10", row.status === "missing" && "text-muted-foreground")} data-testid="paste-key-row" data-status={row.status}>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className="font-medium tabular-nums">{row.numberLabel ?? row.number}</span> <span className="text-muted-foreground">{row.label}</span>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{row.kindLabel}</td>
                      <td className="px-2 py-1.5">{row.raw ?? "—"}</td>
                      <td className="px-2 py-1.5">{row.status === "ok" ? row.parsed : row.status === "mismatch" ? <span className="text-destructive">{row.reason}</span> : "unchanged"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={ok === 0}
            onClick={() => {
              onApply(text);
              setText("");
              onOpenChange(false);
            }}
            data-testid="paste-key-apply"
          >
            Apply {ok > 0 ? `${ok} answer${ok === 1 ? "" : "s"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
