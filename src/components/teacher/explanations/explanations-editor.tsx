"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Pencil, RefreshCw, Sparkles, Trash2, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  approveAllExplanationsAction,
  approveExplanationAction,
  generateExplanationAction,
  removeExplanationAction,
  saveExplanationAction,
  setExplanationAiEnabledAction,
  unapproveExplanationAction,
} from "@/actions/question-explanations.actions";
import type { ExplanationEditorData, ExplanationEditorRow } from "@/lib/exam/question-explanations-server";
import type { ExplanationAiState, ExplanationUsage } from "@/lib/ai/explanation-generation";
import { EXPLANATION_MAX_LENGTH, type ExplanationParts, type ExplanationState } from "@/lib/exam/question-explanations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const STATE_LABEL: Record<ExplanationState, string> = { NONE: "Not written", DRAFT: "Draft", APPROVED: "Approved", OUTDATED: "Outdated" };

const fmt = (n: number) => n.toLocaleString();

/**
 * Phase M2 - the explanations of one test. "Generate explanations for all questions" asks the AI for a draft of every question that has none (one request per
 * question, one after the other, stopping at the daily limit); a teacher then reads each, edits it, regenerates it or approves it - or approves everything at
 * once. A student sees only what is approved, and only while it still matches the question (an edited answer key shows an old explanation as "Outdated").
 */
export function ExplanationsEditor({ data, ai: initialAi, usage }: { data: ExplanationEditorData; ai: ExplanationAiState; usage: ExplanationUsage | null }) {
  const [rows, setRows] = useState<ExplanationEditorRow[]>(data.rows);
  const [ai, setAi] = useState(initialAi);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExplanationParts>({ explain: "", trap: "", fix: "" } as unknown as ExplanationParts);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [bulk, setBulk] = useState<{ total: number; done: number; written: number; failed: number; running: boolean; stopped: string | null } | null>(null);
  const stopBulk = useRef(false);

  const counts = useMemo(
    () => ({
      total: rows.length,
      none: rows.filter((row) => row.state === "NONE").length,
      draft: rows.filter((row) => row.state === "DRAFT").length,
      approved: rows.filter((row) => row.state === "APPROVED").length,
      outdated: rows.filter((row) => row.state === "OUTDATED").length,
    }),
    [rows]
  );

  function patchRow(questionId: string, change: Partial<ExplanationEditorRow>) {
    setRows((current) => current.map((row) => (row.questionId === questionId ? { ...row, ...change } : row)));
  }

  function startEdit(row: ExplanationEditorRow) {
    setEditing(row.questionId);
    setDraft({ explain: row.parts.explain ?? "", trap: row.parts.trap ?? "", fix: row.parts.fix ?? "" } as ExplanationParts);
  }

  function save(row: ExplanationEditorRow, approve: boolean) {
    setBusy(row.questionId);
    startTransition(async () => {
      const result = await saveExplanationAction(data.testId, { questionId: row.questionId, explain: draft.explain ?? "", trap: draft.trap ?? "", fix: draft.fix ?? "", approve });
      setBusy(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      patchRow(row.questionId, {
        state: approve ? "APPROVED" : "DRAFT",
        parts: { explain: draft.explain?.trim() || null, trap: draft.trap?.trim() || null, fix: draft.fix?.trim() || null },
        source: "TEACHER",
        model: null,
      });
      setEditing(null);
      toast.success(approve ? "Saved and approved - students will see it." : "Saved as a draft.");
    });
  }

  function approve(row: ExplanationEditorRow) {
    setBusy(row.questionId);
    startTransition(async () => {
      const result = await approveExplanationAction(data.testId, row.questionId);
      setBusy(null);
      if (!result.success) toast.error(result.error);
      else {
        patchRow(row.questionId, { state: "APPROVED" });
        toast.success("Approved - students will see it.");
      }
    });
  }

  function unapprove(row: ExplanationEditorRow) {
    setBusy(row.questionId);
    startTransition(async () => {
      const result = await unapproveExplanationAction(data.testId, row.questionId);
      setBusy(null);
      if (!result.success) toast.error(result.error);
      else {
        patchRow(row.questionId, { state: "DRAFT" });
        toast.success("Taken back - students no longer see it.");
      }
    });
  }

  function remove(row: ExplanationEditorRow) {
    setBusy(row.questionId);
    startTransition(async () => {
      const result = await removeExplanationAction(data.testId, row.questionId);
      setBusy(null);
      if (!result.success) toast.error(result.error);
      else {
        patchRow(row.questionId, { state: "NONE", parts: { explain: null, trap: null, fix: null }, source: null, model: null, generatedAt: null, approvedAt: null });
        if (editing === row.questionId) setEditing(null);
        toast.success("Removed.");
      }
    });
  }

  function approveAll() {
    setBusy("approve-all");
    startTransition(async () => {
      const result = await approveAllExplanationsAction(data.testId);
      setBusy(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setRows((current) => current.map((row) => (row.state === "DRAFT" ? { ...row, state: "APPROVED" as const } : row)));
      toast.success(`${result.approved} explanation${result.approved === 1 ? "" : "s"} approved - students will see ${result.approved === 1 ? "it" : "them"}.`);
    });
  }

  function toggleAi(enabled: boolean) {
    startTransition(async () => {
      const result = await setExplanationAiEnabledAction(enabled);
      if (!result.success) toast.error(result.error);
      else setAi(result.state);
    });
  }

  /** One AI request; the row becomes a draft with the new text. Returns false when the day's limit (or the switch) stops further requests. */
  async function generateOne(row: ExplanationEditorRow, force: boolean): Promise<{ ok: boolean; stop: string | null }> {
    const result = await generateExplanationAction(data.testId, row.questionId, force);
    if (result.usedToday != null) setAi((current) => ({ ...current, usedToday: result.usedToday ?? current.usedToday }));
    if (result.success) {
      patchRow(row.questionId, { state: "DRAFT", parts: result.parts, source: "AI", model: ai.model, generatedAt: new Date().toISOString(), approvedAt: null });
      return { ok: true, stop: null };
    }
    if (result.code === "LIMIT_REACHED" || result.code === "NOT_ENABLED") return { ok: false, stop: result.error };
    if (result.code === "EXISTS") return { ok: true, stop: null };
    if (force) toast.error(result.error);
    return { ok: false, stop: null };
  }

  async function regenerate(row: ExplanationEditorRow) {
    setBusy(row.questionId);
    const outcome = await generateOne(row, true);
    setBusy(null);
    if (outcome.ok) toast.success("Written again - it is a draft: read it and approve it.");
    else if (outcome.stop) toast.error(outcome.stop);
  }

  async function generateAll() {
    const queue = rows.filter((row) => row.state === "NONE" || row.state === "OUTDATED");
    if (queue.length === 0) {
      toast.info("Every question already has an explanation.");
      return;
    }
    stopBulk.current = false;
    let done = 0;
    let written = 0;
    let failed = 0;
    let stopped: string | null = null;
    setBulk({ total: queue.length, done, written, failed, running: true, stopped });
    for (const row of queue) {
      if (stopBulk.current) {
        stopped = "Stopped.";
        break;
      }
      const outcome = await generateOne(row, false);
      done++;
      if (outcome.stop) {
        stopped = outcome.stop;
        break;
      }
      if (outcome.ok) written++;
      else failed++;
      setBulk({ total: queue.length, done, written, failed, running: true, stopped: null });
    }
    setBulk({ total: queue.length, done, written, failed, running: false, stopped });
    toast[written > 0 ? "success" : "info"](`${written} explanation${written === 1 ? "" : "s"} written - they are drafts until you approve them.`);
  }

  const remaining = Math.max(0, ai.dailyLimit - ai.usedToday);

  return (
    <div className="space-y-5" data-testid="explanations-editor">
      <div className="border-border/70 bg-card space-y-4 rounded-2xl border px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium" data-testid="ex-counts">
              {counts.approved} of {counts.total} question{counts.total === 1 ? "" : "s"} have an approved explanation
              {counts.draft > 0 && <span className="text-amber-600 dark:text-amber-400"> · {counts.draft} draft{counts.draft === 1 ? "" : "s"} to review</span>}
              {counts.outdated > 0 && <span className="text-destructive"> · {counts.outdated} outdated</span>}
            </p>
            <p className="text-muted-foreground text-xs">
              Students see &quot;Explain more&quot; and &quot;What&apos;s the trap?&quot; only where an approved explanation exists. An explanation is written for one wording of a question and answer: if either
              changes, it shows as Outdated and is hidden until it is written again.
              {data.isPublished && " This test is published: explanations can still be written - they change no question, answer or score."}
            </p>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={ai.enabled} onCheckedChange={toggleAi} disabled={pending} aria-label="Generate explanations with AI" data-testid="ex-ai-switch" />
            <span>
              <span className="font-medium">Generate with AI</span>
              <span className="text-muted-foreground block text-xs">{ai.enabled ? `${ai.usedToday} of ${ai.dailyLimit} used today · every text is a draft until you approve it` : "Off - you write the explanations by hand"}</span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {ai.enabled && (
            <>
              <Button type="button" size="sm" variant="outline" disabled={pending || bulk?.running === true || remaining === 0} onClick={() => void generateAll()} data-testid="ex-generate-all">
                {bulk?.running ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Generate explanations for all questions
              </Button>
              {bulk?.running && (
                <Button type="button" size="sm" variant="ghost" onClick={() => (stopBulk.current = true)} data-testid="ex-generate-stop">
                  Stop
                </Button>
              )}
            </>
          )}
          <Button type="button" size="sm" disabled={counts.draft === 0 || pending || busy !== null || bulk?.running === true} onClick={approveAll} data-testid="ex-approve-all">
            {busy === "approve-all" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Approve all{counts.draft > 0 ? ` (${counts.draft})` : ""}
          </Button>
          {bulk && (
            <span className="text-muted-foreground text-xs" role="status" data-testid="ex-bulk-status">
              {bulk.running ? `Asking the AI... ${bulk.done} of ${bulk.total}` : `Done: ${bulk.written} written, ${bulk.failed} could not be written${bulk.stopped ? ` - ${bulk.stopped}` : ""}`}
            </span>
          )}
        </div>

        {usage && (
          <p className="text-muted-foreground border-border/60 border-t pt-3 text-xs" data-testid="ex-usage">
            AI use for explanations (all teachers): today {fmt(usage.today.requests)} requests / {fmt(usage.today.promptTokens + usage.today.completionTokens)} tokens · last 30 days {fmt(usage.last30Days.requests)} /{" "}
            {fmt(usage.last30Days.promptTokens + usage.last30Days.completionTokens)} · all time {fmt(usage.allTime.requests)} / {fmt(usage.allTime.promptTokens + usage.allTime.completionTokens)}. Model: {ai.model}.
          </p>
        )}
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const isEditing = editing === row.questionId;
          const working = busy === row.questionId;
          const locked = busy !== null || pending || bulk?.running === true;
          return (
            <section key={row.questionId} className="border-border/70 bg-card rounded-2xl border" data-testid={`ex-row-${row.startNumber}`} data-state={row.state}>
              <div className="border-border/70 flex flex-wrap items-baseline justify-between gap-3 border-b px-4 py-2.5">
                <p className="text-sm font-medium">
                  {row.startNumber === row.endNumber ? `Question ${row.startNumber}` : `Questions ${row.startNumber}–${row.endNumber}`}
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {row.typeLabel}
                    {row.partTitle ? ` · ${row.partTitle}` : ""}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  {row.hasEvidence && <span className="text-muted-foreground text-xs">evidence set</span>}
                  <Badge variant={row.state === "APPROVED" ? "success" : "outline"} className={cn(row.state === "OUTDATED" && "border-destructive/60 text-destructive", row.state === "DRAFT" && "border-amber-500/60 text-amber-700 dark:text-amber-300")} data-testid={`ex-state-${row.startNumber}`}>
                    {STATE_LABEL[row.state]}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2 px-4 py-3">
                {row.prompt.trim() && row.type !== "SUMMARY_COMPLETION" && <p className="text-muted-foreground line-clamp-2 text-xs">{row.prompt}</p>}
                <p className="text-xs">
                  <span className="text-muted-foreground">Answer: </span>
                  <span className="text-success font-medium break-words">{row.answerLines.join(" · ")}</span>
                </p>

                {isEditing ? (
                  <div className="space-y-3" data-testid={`ex-edit-${row.startNumber}`}>
                    {(
                      [
                        ["explain", "Explain more", "Why the right answer is right. Point to the words in the text."],
                        ["trap", "The trap", "The typical mistake students make on this question."],
                        ["fix", "The fix", "How to avoid it next time."],
                      ] as const
                    ).map(([field, label, hint]) => (
                      <label key={field} className="block space-y-1">
                        <span className="text-xs font-medium">
                          {label} <span className="text-muted-foreground font-normal">- {hint}</span>
                        </span>
                        <Textarea
                          value={draft[field] ?? ""}
                          onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                          rows={field === "explain" ? 5 : 3}
                          maxLength={EXPLANATION_MAX_LENGTH}
                          data-testid={`ex-field-${field}-${row.startNumber}`}
                        />
                      </label>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" disabled={locked} onClick={() => save(row, true)} data-testid={`ex-save-approve-${row.startNumber}`}>
                        {working ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Save and approve
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => save(row, false)} data-testid={`ex-save-${row.startNumber}`}>
                        Save as draft
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : row.state === "NONE" ? (
                  <p className="text-muted-foreground text-xs">No explanation yet. Students see no buttons for this question.</p>
                ) : (
                  <dl className={cn("space-y-2 text-sm", row.state === "OUTDATED" && "opacity-60")} data-testid={`ex-text-${row.startNumber}`}>
                    {row.state === "OUTDATED" && <p className="text-destructive text-xs">Written for an earlier version of this question or its answer - students do not see it. Write it again.</p>}
                    {row.parts.explain && (
                      <div>
                        <dt className="text-muted-foreground text-xs font-medium">Explain more</dt>
                        <dd className="whitespace-pre-line">{row.parts.explain}</dd>
                      </div>
                    )}
                    {row.parts.trap && (
                      <div>
                        <dt className="text-muted-foreground text-xs font-medium">The trap</dt>
                        <dd className="whitespace-pre-line">{row.parts.trap}</dd>
                      </div>
                    )}
                    {row.parts.fix && (
                      <div>
                        <dt className="text-muted-foreground text-xs font-medium">The fix</dt>
                        <dd className="whitespace-pre-line">{row.parts.fix}</dd>
                      </div>
                    )}
                    {row.source && (
                      <p className="text-muted-foreground text-[11px]">
                        {row.source === "AI" ? `Written by the AI${row.model ? ` (${row.model})` : ""}` : "Written by a teacher"}
                      </p>
                    )}
                  </dl>
                )}

                {!isEditing && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => startEdit(row)} data-testid={`ex-edit-button-${row.startNumber}`}>
                      <Pencil className="size-3.5" /> {row.state === "NONE" ? "Write" : "Edit"}
                    </Button>
                    {ai.enabled && (
                      <Button type="button" size="sm" variant="outline" disabled={locked || remaining === 0} onClick={() => void regenerate(row)} data-testid={`ex-regenerate-${row.startNumber}`}>
                        {working ? <Loader2 className="size-3.5 animate-spin" /> : row.state === "NONE" ? <Sparkles className="size-3.5" /> : <RefreshCw className="size-3.5" />} {row.state === "NONE" ? "Generate" : "Regenerate"}
                      </Button>
                    )}
                    {row.state === "DRAFT" && (
                      <Button type="button" size="sm" disabled={locked} onClick={() => approve(row)} data-testid={`ex-approve-${row.startNumber}`}>
                        <CheckCircle2 className="size-3.5" /> Approve
                      </Button>
                    )}
                    {row.state === "APPROVED" && (
                      <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => unapprove(row)} data-testid={`ex-unapprove-${row.startNumber}`}>
                        <Undo2 className="size-3.5" /> Take back
                      </Button>
                    )}
                    {row.state !== "NONE" && (
                      <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={locked} onClick={() => remove(row)} data-testid={`ex-remove-${row.startNumber}`}>
                        <Trash2 className="size-3.5" /> Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
