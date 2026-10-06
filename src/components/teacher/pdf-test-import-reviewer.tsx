"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { QuestionType } from "@prisma/client";
import { AlertTriangle, CheckCircle2, Info, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  analyzeImportedTestAction,
  confirmImportAction,
  deleteImportedAnswerAction,
  deleteImportedPassageAction,
  deleteImportedQuestionGroupAction,
  deleteImportedTestAction,
  updateImportedPassageAction,
  updateImportedQuestionGroupAction,
  updateImportedTestMetaAction,
  upsertImportedAnswerAction,
} from "@/actions/pdf-test-import.actions";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { chooseChunks, importedQuestionGroupJsonSchema } from "@/lib/exam/pdf-import-conversion";
import { chooseWord } from "@/lib/exam/choose-many";
import { formatNumberRanges, type GroupStats, type ImportValidation } from "@/lib/exam/pdf-import-validation";
import type { ImportedTestForReview } from "@/lib/pdf-test-import";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type PassageRow = ImportedTestForReview["passages"][number];
type GroupRow = PassageRow["questionGroups"][number];
type AnswerRow = ImportedTestForReview["answers"][number];

// ---------------------------------------------------------------------------
// Failed / not-ready states
// ---------------------------------------------------------------------------

function FailedImportCard({ importedTestId, errorMessage }: { importedTestId: string; errorMessage: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const result = await analyzeImportedTestAction(importedTestId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteImportedTestAction(importedTestId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.push("/teacher/tests/import");
    });
  }

  return (
    <Card className="border-destructive/40">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="text-destructive mt-0.5 size-5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium">This PDF couldn&apos;t be analyzed</p>
            <p className="text-muted-foreground text-sm">{errorMessage || "An unexpected error occurred."}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={retry} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Retry analysis
          </Button>
          <Button size="sm" variant="outline" onClick={remove} disabled={pending}>
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Import checklist — what was found, what's missing, and whether it can be imported.
// ---------------------------------------------------------------------------

function ReanalyzeButton({ importedTestId }: { importedTestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function reanalyze() {
    startTransition(async () => {
      const result = await analyzeImportedTestAction(importedTestId);
      setOpen(false);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("PDF re-analyzed.");
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <RotateCcw className="size-3.5" /> Re-analyze PDF
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-analyze this PDF?</DialogTitle>
            <DialogDescription>
              The PDF is read again from scratch and everything below is replaced — including any edits you&apos;ve made. It can take up to a minute.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={reanalyze} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? "Analyzing…" : "Re-analyze"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImportChecklist({ importedTestId, validation }: { importedTestId: string; validation: ImportValidation }) {
  const blockCount = validation.passages.reduce((sum, p) => sum + p.groups.length, 0);
  const keyMismatch = validation.answerCount !== validation.totalQuestions;
  const issueCount = validation.issues.length;

  return (
    <Card className={validation.ok ? "border-success/40" : "border-destructive/40"}>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {validation.ok ? <CheckCircle2 className="text-success size-5" /> : <AlertTriangle className="text-destructive size-5" />}
            <h2 className="font-display text-lg font-medium">
              {validation.ok ? "Everything was found — ready to import" : `${issueCount} issue${issueCount === 1 ? "" : "s"} to fix before importing`}
            </h2>
          </div>
          <ReanalyzeButton importedTestId={importedTestId} />
        </div>

        <div className="space-y-2">
          {validation.passages.map((passage) => (
            <div key={passage.passageId} className="border-border/70 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{passage.label}</p>
                <p className="text-muted-foreground max-w-xs truncate text-xs">{passage.title}</p>
              </div>
              <div className="text-right">
                <p className={passage.questionCount === 0 ? "text-destructive text-sm font-medium" : "text-sm font-medium"}>
                  Questions: {passage.questionCount}
                  {passage.extractedRange && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      ({passage.extractedRange.start}–{passage.extractedRange.end})
                    </span>
                  )}
                </p>
                {passage.missingNumbers.length > 0 && <p className="text-destructive text-xs">Missing inside this passage: {formatNumberRanges(passage.missingNumbers)}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="bg-secondary/50 rounded-xl px-3 py-2.5 text-center">
            <p className="text-muted-foreground text-[11px] font-medium">Total Questions</p>
            <p className={keyMismatch ? "font-display text-destructive text-xl font-medium" : "font-display text-xl font-medium"}>{validation.totalQuestions}</p>
          </div>
          <div className="bg-secondary/50 rounded-xl px-3 py-2.5 text-center">
            <p className="text-muted-foreground text-[11px] font-medium">Answer key entries</p>
            <p className={keyMismatch ? "font-display text-destructive text-xl font-medium" : "font-display text-xl font-medium"}>{validation.answerCount}</p>
          </div>
          <div className="bg-secondary/50 rounded-xl px-3 py-2.5 text-center">
            <p className="text-muted-foreground text-[11px] font-medium">Passages</p>
            <p className="font-display text-xl font-medium">{validation.passages.length}</p>
          </div>
          <div className="bg-secondary/50 rounded-xl px-3 py-2.5 text-center">
            <p className="text-muted-foreground text-[11px] font-medium">Question blocks</p>
            <p className="font-display text-xl font-medium">{blockCount}</p>
          </div>
        </div>

        {validation.missingNumbers.length > 0 && (
          <p className="text-destructive text-sm">
            <span className="font-medium">Not found in the import:</span> questions {formatNumberRanges(validation.missingNumbers)}
          </p>
        )}

        {validation.issues.length > 0 && (
          <ul className="space-y-1.5">
            {validation.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`} className="text-destructive flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}

        {validation.notes.map((note) => (
          <p key={note} className="text-muted-foreground flex items-start gap-2 text-xs">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {note}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Answer key
// ---------------------------------------------------------------------------

function AnswerKeyRow({
  importedTestId,
  questionNumber,
  initialAnswer,
  hasQuestion,
}: {
  importedTestId: string;
  questionNumber: number;
  initialAnswer: string;
  hasQuestion: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialAnswer);
  const [saved, setSaved] = useState(initialAnswer.length > 0);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!value.trim()) {
      toast.error("Enter an answer, or leave the detected one in place.");
      return;
    }
    startTransition(async () => {
      const result = await upsertImportedAnswerAction(importedTestId, { questionNumber, answerText: value.trim() });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSaved(true);
      toast.success(`Answer for Q${questionNumber} saved.`);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteImportedAnswerAction(importedTestId, questionNumber);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Answer for Q${questionNumber} removed.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-10 shrink-0 text-right text-xs font-medium">#{questionNumber}</span>
        <Input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          placeholder="No answer detected"
          className={hasQuestion ? "h-8 text-sm" : "border-destructive/50 h-8 text-sm"}
        />
        <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={save} disabled={pending || saved} aria-label={`Save answer ${questionNumber}`}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className={saved ? "text-muted-foreground size-3.5" : "size-3.5"} />}
        </Button>
        {!hasQuestion && (
          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive size-8 shrink-0" onClick={remove} disabled={pending} aria-label={`Remove answer ${questionNumber}`}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
        {hasQuestion && !saved && !value.trim() && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-label="Missing answer" />}
      </div>
      {!hasQuestion && <p className="text-destructive pl-12 text-[11px]">No question was extracted for this answer</p>}
    </div>
  );
}

function AnswerKeySection({ importedTestId, validation, answers }: { importedTestId: string; validation: ImportValidation; answers: AnswerRow[] }) {
  const answerByNumber = useMemo(() => new Map(answers.map((a) => [a.questionNumber, a.answerText])), [answers]);
  const questionNumbers = useMemo(() => new Set(validation.passages.flatMap((p) => p.groups.flatMap((g) => g.extractedNumbers))), [validation]);
  const rows = useMemo(() => [...new Set([...questionNumbers, ...answers.map((a) => a.questionNumber)])].sort((a, b) => a - b), [questionNumbers, answers]);
  const missingCount = rows.filter((n) => questionNumbers.has(n) && !answerByNumber.get(n)).length;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium">Answer Key</h2>
          {missingCount > 0 && (
            <Badge variant="outline" className="text-amber-600">
              {missingCount} missing
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">Only you can see this — students never have access to answer data.</p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((n) => (
            <AnswerKeyRow key={n} importedTestId={importedTestId} questionNumber={n} initialAnswer={answerByNumber.get(n) ?? ""} hasQuestion={questionNumbers.has(n)} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Question group
// ---------------------------------------------------------------------------

function ImportedQuestionGroupCard({ importedTestId, group, stats }: { importedTestId: string; group: GroupRow; stats: GroupStats | undefined }) {
  const router = useRouter();
  const parsed = useMemo(() => importedQuestionGroupJsonSchema.safeParse(group.questionsJson), [group.questionsJson]);
  const json = parsed.success ? parsed.data : null;
  const [instructions, setInstructions] = useState(group.instructions);
  const [summaryText, setSummaryText] = useState(json?.summaryText ?? "");
  const [items, setItems] = useState(json?.items ?? []);
  const [wordBankText, setWordBankText] = useState((json?.wordBank ?? []).join("\n"));
  const [pending, startTransition] = useTransition();
  const meta = QUESTION_TYPE_META[group.questionType as QuestionType];
  const showWordBank = group.questionType === "SUMMARY_COMPLETION" || (json?.wordBank.length ?? 0) > 0;

  function save() {
    startTransition(async () => {
      const result = await updateImportedQuestionGroupAction(importedTestId, group.id, {
        instructions,
        summaryText: group.questionType === "SUMMARY_COMPLETION" ? summaryText : undefined,
        items: items.length > 0 ? items : undefined,
        wordBank: showWordBank
          ? wordBankText
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
          : undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Question group saved.");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteImportedQuestionGroupAction(importedTestId, group.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!json) {
    return (
      <Card className="border-destructive/40 bg-secondary/20">
        <CardContent className="flex items-center justify-between gap-3 pt-5 text-sm">
          <p className="text-destructive">
            Questions {group.startNumber}–{group.endNumber}: this block&apos;s data is unreadable — delete it, or re-analyze the PDF.
          </p>
          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive size-7" onClick={remove} disabled={pending} aria-label="Delete this block">
            <Trash2 className="size-3.5" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const missingToShow = (stats?.missingNumbers ?? []).filter((n) => !items.some((item) => item.number === n));
  // Phase M - "Choose TWO letters" is imported as ONE question per pair of numbers (one mark per correct letter, any order), not one question per number.
  const pairs = chooseChunks({ questionType: group.questionType, startNumber: group.startNumber, endNumber: group.endNumber, instructions });
  const chooseNote = pairs
    ? `"Choose ${chooseWord(pairs[0].length)}": ${pairs.map((numbers) => `questions ${numbers[0]}–${numbers[numbers.length - 1]}`).join(" and ")} will be imported as ${pairs.length === 1 ? "ONE question" : `${pairs.length} questions`} that ${pairs.length === 1 ? "covers" : "cover"} ${pairs[0].length} numbers each - one mark per correct letter, in any order. The answer key may list the letters under either number.`
    : null;
  const canAddByHand = group.questionType !== "MULTIPLE_CHOICE" && group.questionType !== "MATCHING" && group.questionType !== "SUMMARY_COMPLETION";

  function addMissing(number: number) {
    setItems((prev) => [...prev, { number, prompt: "", choices: [] }].sort((a, b) => a.number - b.number));
  }

  return (
    <Card className={missingToShow.length > 0 ? "border-destructive/40 bg-secondary/20" : "bg-secondary/20"}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">
              Questions {group.startNumber}-{group.endNumber}
            </Badge>
            <span className="text-muted-foreground text-xs">{meta.label}</span>
            {stats && stats.missingNumbers.length === 0 && <span className="text-muted-foreground text-xs">· all {stats.extractedNumbers.length} extracted</span>}
            {stats && stats.missingNumbers.length > 0 && <span className="text-destructive text-xs">· missing {formatNumberRanges(stats.missingNumbers)}</span>}
          </div>
          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive size-7" onClick={remove} disabled={pending} aria-label="Delete this block">
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Instructions</Label>
          <Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={2} className="text-sm" />
          {chooseNote && (
            <p className="text-muted-foreground text-[11px]" data-testid="choose-note">
              {chooseNote}
            </p>
          )}
        </div>

        {group.questionType === "SUMMARY_COMPLETION" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Summary text (blanks shown as [number])</Label>
            <Textarea value={summaryText} onChange={(event) => setSummaryText(event.target.value)} rows={4} className="text-sm" />
          </div>
        )}

        {showWordBank && (
          <div className="space-y-1.5">
            <Label className="text-xs">Word list — one per line, in printed order (A first)</Label>
            <Textarea value={wordBankText} onChange={(event) => setWordBankText(event.target.value)} rows={4} className="font-mono text-sm" placeholder={"currents\ngravity\ncameras"} />
            <p className="text-muted-foreground text-[11px]">An answer-key letter like &quot;B&quot; is turned into the second word on this list when the test is imported.</p>
          </div>
        )}

        {group.questionType === "MATCHING" && (
          <div className="text-muted-foreground space-y-1 text-xs">
            <p>
              {json.matchingPrompts.length} items to match against {json.matchingOptions.length} options — edit the answer key below; use the test editor after import for deeper changes.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={item.number} className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1.5 w-10 shrink-0 text-right text-xs font-medium">#{item.number}</span>
                <Textarea
                  value={item.prompt}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, prompt: event.target.value };
                    setItems(next);
                  }}
                  rows={1}
                  className="text-sm"
                />
              </div>
            ))}
          </div>
        )}

        {missingToShow.length > 0 && (
          <div className="border-destructive/30 space-y-1.5 rounded-lg border border-dashed p-3">
            <p className="text-destructive text-xs font-medium">
              {missingToShow.length === 1 ? "1 question wasn't" : `${missingToShow.length} questions weren't`} extracted from this block
            </p>
            {canAddByHand ? (
              <div className="flex flex-wrap gap-1.5">
                {missingToShow.map((n) => (
                  <Button key={n} size="sm" variant="outline" onClick={() => addMissing(n)}>
                    <Plus className="size-3" /> Add question {n}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">Use Re-analyze PDF to try extracting this block again.</p>
            )}
          </div>
        )}

        <Button size="sm" variant="outline" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save group
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Passage
// ---------------------------------------------------------------------------

function ImportedPassageCard({
  importedTestId,
  passage,
  label,
  questionCount,
  missingNumbers,
  groupStats,
}: {
  importedTestId: string;
  passage: PassageRow;
  label: string;
  questionCount: number;
  missingNumbers: number[];
  groupStats: Map<string, GroupStats>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(passage.title);
  const [content, setContent] = useState(passage.content);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateImportedPassageAction(importedTestId, passage.id, { title, content });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Passage saved.");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteImportedPassageAction(importedTestId, passage.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <AccordionItem value={passage.id}>
      <AccordionTrigger>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-normal">{label}</span>
          {title || "Untitled passage"}
          <Badge variant={questionCount === 0 || missingNumbers.length > 0 ? "destructive" : "outline"} className="text-[11px]">
            {questionCount} question{questionCount === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            {passage.questionGroups.length} block{passage.questionGroups.length === 1 ? "" : "s"}
          </Badge>
          {missingNumbers.length > 0 && <span className="text-destructive text-xs font-normal">missing {formatNumberRanges(missingNumbers)}</span>}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Content</Label>
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} rows={8} className="text-sm" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save passage
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove} disabled={pending}>
              <Trash2 className="size-3.5" /> Delete passage
            </Button>
          </div>

          <div className="space-y-3 pt-2">
            {passage.questionGroups.map((group) => (
              <ImportedQuestionGroupCard key={group.id} importedTestId={importedTestId} group={group} stats={groupStats.get(group.id)} />
            ))}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ---------------------------------------------------------------------------
// Confirm panel
// ---------------------------------------------------------------------------

function ConfirmImportPanel({ importedTestId, defaultTitle, validation }: { importedTestId: string; defaultTitle: string; validation: ImportValidation }) {
  const router = useRouter();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"GENERAL" | "CAMBRIDGE">("GENERAL");
  const [pending, startTransition] = useTransition();
  const blocked = !validation.ok;

  function confirm() {
    if (title.trim().length < 3) {
      toast.error("Title must be at least 3 characters.");
      return;
    }
    startTransition(async () => {
      const result = await confirmImportAction(importedTestId, { title: title.trim(), description: description.trim() || undefined, category });
      if (!result.success) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success(`Test imported — ${validation.totalQuestions} questions.`);
      router.push(`/teacher/tests/${result.mockTestId}`);
    });
  }

  return (
    <Card className={blocked ? "border-border/70" : "border-accent/40"}>
      <CardContent className="space-y-4 pt-6">
        <h2 className="font-display text-lg font-medium">Import Test</h2>
        <div className="space-y-1.5">
          <Label className="text-xs">Test title</Label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Description (optional)</Label>
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as "GENERAL" | "CAMBRIDGE")}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GENERAL">General</SelectItem>
              <SelectItem value="CAMBRIDGE">Cambridge (free tier)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={confirm} disabled={pending || blocked} className="w-full">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Import Test
        </Button>
        {blocked ? (
          <p className="text-destructive text-xs">
            Import is locked until the {validation.issues.length} issue{validation.issues.length === 1 ? "" : "s"} listed at the top are fixed — a test with missing or unmatched questions can&apos;t be imported.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            This creates a real test from the reviewed content above — it won&apos;t be published until you publish it from the test editor.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function PdfTestImportReviewer({ importedTest, validation }: { importedTest: ImportedTestForReview; validation: ImportValidation }) {
  const router = useRouter();
  const [titleSaving, startTitleTransition] = useTransition();
  const [title, setTitle] = useState(importedTest.title ?? importedTest.sourceFileName);
  const passageStats = useMemo(() => new Map(validation.passages.map((p) => [p.passageId, p])), [validation]);
  const groupStats = useMemo(() => new Map(validation.passages.flatMap((p) => p.groups).map((g) => [g.groupId, g])), [validation]);

  if (importedTest.status === "IMPORTED" && importedTest.resultMockTestId) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6 text-sm">
          <p>This PDF has already been imported.</p>
          <Button asChild size="sm">
            <Link href={`/teacher/tests/${importedTest.resultMockTestId}`}>Open the test</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (importedTest.status === "FAILED") {
    return <FailedImportCard importedTestId={importedTest.id} errorMessage={importedTest.errorMessage} />;
  }

  if (importedTest.status !== "PARSED") {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6 text-sm">
          <p className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Still analyzing — refresh in a moment.
          </p>
          <Button size="sm" variant="outline" onClick={() => router.refresh()}>
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  function saveTitle() {
    startTitleTransition(async () => {
      const result = await updateImportedTestMetaAction(importedTest.id, { title });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Title saved.");
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-2 pt-6">
          <Label className="text-xs">Detected title</Label>
          <div className="flex gap-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            <Button size="sm" variant="outline" onClick={saveTitle} disabled={titleSaving} aria-label="Save title">
              {titleSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ImportChecklist importedTestId={importedTest.id} validation={validation} />

      {importedTest.passages.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm">
            <p className="text-muted-foreground">No passages left to import — re-analyze the PDF to start again.</p>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" defaultValue={importedTest.passages.map((p) => p.id)}>
          {importedTest.passages.map((passage, index) => {
            const stats = passageStats.get(passage.id);
            return (
              <ImportedPassageCard
                key={passage.id}
                importedTestId={importedTest.id}
                passage={passage}
                label={stats?.label ?? `Passage ${index + 1}`}
                questionCount={stats?.questionCount ?? 0}
                missingNumbers={stats?.missingNumbers ?? []}
                groupStats={groupStats}
              />
            );
          })}
        </Accordion>
      )}

      <AnswerKeySection importedTestId={importedTest.id} validation={validation} answers={importedTest.answers} />

      <ConfirmImportPanel importedTestId={importedTest.id} defaultTitle={title} validation={validation} />
    </div>
  );
}
