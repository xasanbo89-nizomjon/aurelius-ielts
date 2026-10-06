"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Eraser, Highlighter, Loader2, Sparkles, Target, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { buildPieces, paragraphLabelMap, passageRegion, type HighlightRange } from "@/lib/exam/text-highlight";
import { resolveItem, type EvidenceItem } from "@/lib/exam/answer-evidence-store";
import { selectionToTargets } from "@/components/exam/highlight/selection-targets";
import { clearEvidenceAction, confirmEvidenceAction, setEvidenceAction, setEvidenceAiEnabledAction, suggestEvidenceAction } from "@/actions/answer-evidence.actions";
import type { EvidenceEditorData, EvidenceEditorRow } from "@/lib/exam/answer-evidence-server";
import type { EvidenceAiState } from "@/lib/ai/evidence-suggestions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type Selection = { start: number; end: number; text: string };
type Key = { questionId: string; slot: number };
const keyOf = (key: Key) => `${key.questionId}:${key.slot}`;

/**
 * Phase M - "Answer evidence": the teacher marks, for each question number, the words of the passage (or transcript) that hold the answer. The review page
 * then offers the student "Show in passage" for it. Select text in the passage, pick the question number, press "Set as evidence". Every change is saved at
 * once. This never touches the questions, the answers or any score, so it works on a published test and on one that students have already taken.
 */
export function EvidenceEditor({ data, ai: initialAi }: { data: EvidenceEditorData; ai: EvidenceAiState }) {
  const [rows, setRows] = useState<EvidenceEditorRow[]>(data.rows);
  const [partId, setPartId] = useState(() => data.parts.find((part) => data.rows.some((row) => row.partId === part.id))?.id ?? data.parts[0]?.id ?? "");
  const [active, setActive] = useState<Key | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [ai, setAi] = useState(initialAi);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const part = data.parts.find((candidate) => candidate.id === partId) ?? null;
  const partRows = useMemo(() => rows.filter((row) => row.partId === partId), [rows, partId]);
  const listening = data.testType === "LISTENING";
  const partName = (index: number) => (listening ? `Part ${index + 1}` : `Passage ${index + 1}`);

  // ---- coverage, live -----------------------------------------------------------------------------------------------------------------------------
  const coverage = useMemo(() => {
    const numbers = rows.flatMap((row) => row.numbers);
    return {
      total: numbers.length,
      confirmed: numbers.filter((entry) => entry.item?.state === "CONFIRMED").length,
      suggested: numbers.filter((entry) => entry.item?.state === "SUGGESTED").length,
      missing: numbers.filter((entry) => !entry.item && !entry.needsNoEvidence).length,
    };
  }, [rows]);

  // ---- the passage, with every item of this part marked ---------------------------------------------------------------------------------------------
  const marks = useMemo(() => {
    if (!part) return [] as (HighlightRange & { state: EvidenceItem["state"] })[];
    return partRows.flatMap((row) =>
      row.numbers.flatMap((entry) => {
        if (!entry.item || entry.item.passageId !== part.id) return [];
        const span = resolveItem(part.content, entry.item);
        return span ? [{ id: keyOf({ questionId: row.questionId, slot: entry.slot }), start: span.start, end: span.end, state: entry.item.state }] : [];
      })
    );
  }, [part, partRows]);

  const pieces = useMemo(() => (part ? buildPieces(part.content.length, marks, [], paragraphLabelMap(part.content)) : []), [part, marks]);
  const stateById = useMemo(() => new Map(marks.map((mark) => [mark.id, mark.state])), [marks]);
  const activeKey = active ? keyOf(active) : null;

  // ---- reading the selection ------------------------------------------------------------------------------------------------------------------------
  const readSelection = useCallback(() => {
    const surface = surfaceRef.current;
    const picked = window.getSelection();
    if (!surface || !part || !picked || picked.rangeCount === 0 || picked.isCollapsed) return;
    const range = picked.getRangeAt(0);
    if (!surface.contains(range.commonAncestorContainer)) return;
    const target = selectionToTargets(surface, range).find((candidate) => candidate.region === passageRegion(part.id));
    if (target) setSelection({ start: target.start, end: target.end, text: target.text });
  }, [part]);

  useEffect(() => {
    // a selection made with the keyboard or a touch handle arrives here too
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(readSelection, 120);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (timer) clearTimeout(timer);
    };
  }, [readSelection]);

  useEffect(() => setSelection(null), [partId]);

  // ---- changing a number's evidence ---------------------------------------------------------------------------------------------------------------
  function applyItems(questionId: string, items: EvidenceItem[]) {
    setRows((current) => current.map((row) => (row.questionId !== questionId ? row : { ...row, numbers: row.numbers.map((entry) => ({ ...entry, item: items.find((item) => item.slot === entry.slot) ?? null })) })));
  }

  function run(key: Key, work: () => Promise<{ success: boolean; error?: string; items?: EvidenceItem[] }>, done?: string) {
    setBusy(keyOf(key));
    startTransition(async () => {
      const result = await work();
      setBusy(null);
      if (!result.success) {
        toast.error(result.error ?? "That did not work.");
        return;
      }
      if (result.items) applyItems(key.questionId, result.items);
      if (done) toast.success(done);
    });
  }

  function setFromSelection() {
    if (!active || !selection || !part) return;
    run(active, () => setEvidenceAction(data.testId, { questionId: active.questionId, slot: active.slot, passageId: part.id, start: selection.start, end: selection.end }), "Evidence saved.");
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  function showInPassage(key: Key) {
    setActive(key);
    requestAnimationFrame(() => surfaceRef.current?.querySelector(`[data-ev-key="${CSS.escape(keyOf(key))}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function toggleAi(enabled: boolean) {
    startTransition(async () => {
      const result = await setEvidenceAiEnabledAction(enabled);
      if (!result.success) toast.error(result.error);
      else setAi(result.state);
    });
  }

  function suggest(key: Key) {
    setBusy(keyOf(key));
    startTransition(async () => {
      const result = await suggestEvidenceAction(data.testId, key);
      setBusy(null);
      if (result.usedToday != null) setAi((current) => ({ ...current, usedToday: result.usedToday ?? current.usedToday }));
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      applyItems(key.questionId, result.items);
      toast.success("Suggestion saved - it is hidden from students until you confirm it.");
      showInPassage(key);
    });
  }

  const target = active ? partRows.flatMap((row) => row.numbers.map((entry) => ({ row, entry }))).find(({ row, entry }) => keyOf({ questionId: row.questionId, slot: entry.slot }) === activeKey) : null;

  return (
    <div className="space-y-5" data-testid="evidence-editor">
      {/* ---- summary + AI ---- */}
      <div className="border-border/70 bg-card flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4">
        <div className="space-y-1">
          <p className="text-sm font-medium" data-testid="ev-coverage">
            Evidence is set for {coverage.confirmed} of {coverage.total} question{coverage.total === 1 ? "" : "s"}
            {coverage.suggested > 0 && <span className="text-amber-600 dark:text-amber-400"> · {coverage.suggested} AI suggestion{coverage.suggested === 1 ? "" : "s"} waiting for you</span>}
          </p>
          <p className="text-muted-foreground text-xs">
            Students see &quot;Show in passage&quot; in their review only where evidence is set. A True / False / Not Given question whose answer is Not Given needs none.
            {data.isPublished && " This test is published: evidence can still be set - it changes no question, answer or score."}
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={ai.enabled} onCheckedChange={toggleAi} disabled={pending} aria-label="Suggest evidence with AI" data-testid="ev-ai-switch" />
          <span>
            <span className="font-medium">Suggest with AI</span>
            <span className="text-muted-foreground block text-xs">{ai.enabled ? `${ai.usedToday} of ${ai.dailyLimit} used today · you confirm every suggestion` : "Off - you set the evidence by hand"}</span>
          </span>
        </label>
      </div>

      {/* ---- parts ---- */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Parts of the test">
        {data.parts.map((candidate, index) => {
          const count = rows.filter((row) => row.partId === candidate.id).reduce((sum, row) => sum + row.numbers.length, 0);
          const done = rows.filter((row) => row.partId === candidate.id).reduce((sum, row) => sum + row.numbers.filter((entry) => entry.item?.state === "CONFIRMED").length, 0);
          return (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={candidate.id === partId}
              onClick={() => setPartId(candidate.id)}
              data-testid={`ev-part-${index + 1}`}
              className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition-colors", candidate.id === partId ? "bg-primary text-primary-foreground border-primary" : "border-border/70 hover:bg-secondary")}
            >
              {partName(index)} <span className="text-xs opacity-80">{done}/{count}</span>
            </button>
          );
        })}
      </div>

      {!part ? (
        <p className="text-muted-foreground text-sm">This test has no parts yet.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* ---- the passage ---- */}
          <section className="border-border/70 bg-card flex max-h-[78vh] flex-col overflow-hidden rounded-2xl border" aria-label={listening ? "Transcript" : "Passage"}>
            <div className="border-border/70 space-y-2 border-b px-5 py-3">
              <h2 className="font-display truncate text-base font-medium">{part.title || (listening ? "Transcript" : "Passage")}</h2>
              <div className="bg-secondary/60 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs" data-testid="ev-selection-bar">
                {selection ? (
                  <>
                    <span className="min-w-0 flex-1 truncate" data-testid="ev-selection-text">
                      <Target className="mr-1 inline size-3.5" aria-hidden="true" />“{selection.text.length > 140 ? `${selection.text.slice(0, 140)}…` : selection.text}” <span className="text-muted-foreground">({selection.text.length} characters)</span>
                    </span>
                    <Button type="button" size="sm" disabled={!active || pending} onClick={setFromSelection} data-testid="ev-set-button">
                      <Highlighter className="size-3.5" /> {target ? `Set as evidence for Q${target.entry.number}` : "Pick a question number →"}
                    </Button>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {part.content.trim() ? "Pick a question number on the right, then select the words that hold its answer here." : listening ? "This part has no transcript. Add one in the test editor, then come back." : "This passage has no text."}
                  </span>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div
                ref={surfaceRef}
                className="font-display text-[15px] leading-[1.8] whitespace-pre-wrap selection:bg-accent/30"
                onPointerDown={() => setSelection(null)}
                onPointerUp={() => setTimeout(readSelection, 0)}
                data-testid="ev-passage"
              >
                <div data-hl-region={passageRegion(part.id)}>
                  {pieces.map((piece) => {
                    const ids = piece.highlightIds;
                    const primary = ids.includes(activeKey ?? "") ? (activeKey as string) : ids[0];
                    const state = primary ? stateById.get(primary) : undefined;
                    const inner = primary ? (
                      <mark
                        data-ev-key={primary}
                        className={cn(
                          "rounded-sm px-0.5 text-inherit",
                          state === "SUGGESTED" ? "bg-amber-500/20 outline-1 outline-dashed outline-amber-500/70" : "bg-success/25",
                          primary === activeKey && "ring-2 ring-sky-500"
                        )}
                      >
                        {part.content.slice(piece.start, piece.end)}
                      </mark>
                    ) : (
                      part.content.slice(piece.start, piece.end)
                    );
                    return piece.paragraphLabel ? (
                      <span key={piece.start} className="ev-para" data-label={piece.paragraphLabel}>
                        {inner}
                      </span>
                    ) : (
                      <span key={piece.start}>{inner}</span>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ---- the questions of this part ---- */}
          <section className="space-y-3" aria-label="Question numbers">
            {partRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">This {listening ? "part" : "passage"} has no questions.</p>
            ) : (
              partRows.map((row) => (
                <div key={row.questionId} className="border-border/70 bg-card rounded-2xl border">
                  <div className="border-border/70 flex items-baseline justify-between gap-3 border-b px-4 py-2.5">
                    <p className="text-sm font-medium">
                      {row.startNumber === row.endNumber ? `Question ${row.startNumber}` : `Questions ${row.startNumber}–${row.endNumber}`}
                      <span className="text-muted-foreground ml-2 text-xs font-normal">{row.typeLabel}</span>
                    </p>
                  </div>
                  {row.prompt.trim() && row.type !== "SUMMARY_COMPLETION" && <p className="text-muted-foreground line-clamp-2 px-4 pt-2 text-xs">{row.prompt}</p>}
                  <ul className="divide-border/70 divide-y">
                    {row.numbers.map((entry) => {
                      const key = { questionId: row.questionId, slot: entry.slot };
                      const isActive = keyOf(key) === activeKey;
                      const state = entry.item?.state ?? (entry.needsNoEvidence ? "none-needed" : "none");
                      const working = busy === keyOf(key);
                      return (
                        <li key={entry.slot} className={cn("space-y-2 px-4 py-3", isActive && "bg-sky-500/5")} data-testid={`ev-number-${entry.number}`} data-state={state}>
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => setActive(key)} aria-pressed={isActive} className="flex min-w-0 flex-1 items-baseline gap-2 text-left" data-testid={`ev-pick-${entry.number}`}>
                              <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold", isActive ? "bg-sky-600 text-white" : "bg-secondary")}>{entry.number}</span>
                              <span className="min-w-0 text-sm">
                                {entry.label && <span className="text-muted-foreground mr-1.5 text-xs">{entry.label}</span>}
                                <span className="text-success font-medium break-words">{entry.answer}</span>
                              </span>
                            </button>
                            {entry.item?.state === "CONFIRMED" && (
                              <Badge variant="success" className="gap-1">
                                <CheckCircle2 className="size-3" aria-hidden="true" /> Evidence set
                              </Badge>
                            )}
                            {entry.item?.state === "SUGGESTED" && <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-300">AI suggestion</Badge>}
                            {!entry.item && entry.needsNoEvidence && <Badge variant="outline">Not Given - none needed</Badge>}
                            {!entry.item && !entry.needsNoEvidence && <Badge variant="outline">Not set</Badge>}
                          </div>

                          {entry.item && (
                            <p className="text-muted-foreground line-clamp-2 border-l-2 pl-3 text-xs italic" data-testid={`ev-quote-${entry.number}`}>
                              “{entry.item.quote}”
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-1.5">
                            {entry.item && entry.item.passageId === part.id && (
                              <Button type="button" size="sm" variant="ghost" onClick={() => showInPassage(key)} data-testid={`ev-show-${entry.number}`}>
                                Show
                              </Button>
                            )}
                            {entry.item?.state === "SUGGESTED" && (
                              <Button type="button" size="sm" disabled={working || pending} onClick={() => run(key, () => confirmEvidenceAction(data.testId, key), "Confirmed - students will see it.")} data-testid={`ev-confirm-${entry.number}`}>
                                <CheckCircle2 className="size-3.5" /> Confirm
                              </Button>
                            )}
                            {entry.item && (
                              <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={working || pending} onClick={() => run(key, () => clearEvidenceAction(data.testId, key), entry.item?.state === "SUGGESTED" ? "Suggestion rejected." : "Evidence removed.")} data-testid={`ev-clear-${entry.number}`}>
                                {entry.item.state === "SUGGESTED" ? <XCircle className="size-3.5" /> : <Eraser className="size-3.5" />} {entry.item.state === "SUGGESTED" ? "Reject" : "Remove"}
                              </Button>
                            )}
                            {ai.enabled && entry.item?.state !== "CONFIRMED" && !entry.needsNoEvidence && (
                              <Button type="button" size="sm" variant="outline" disabled={working || pending || ai.usedToday >= ai.dailyLimit || !part.content.trim()} onClick={() => suggest(key)} data-testid={`ev-suggest-${entry.number}`}>
                                {working ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Suggest with AI
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
