"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { QuestionType } from "@prisma/client";
import { AlertTriangle, Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  analyzeImportedTestAction,
  confirmImportAction,
  deleteImportedPassageAction,
  deleteImportedQuestionGroupAction,
  deleteImportedTestAction,
  updateImportedPassageAction,
  updateImportedQuestionGroupAction,
  updateImportedTestMetaAction,
  upsertImportedAnswerAction,
} from "@/actions/pdf-test-import.actions";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { importedQuestionGroupJsonSchema, type ImportedQuestionGroupJson } from "@/lib/exam/pdf-import-conversion";
import type { ImportedTestForReview } from "@/lib/pdf-test-import";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type PassageRow = ImportedTestForReview["passages"][number];
type GroupRow = PassageRow["questionGroups"][number];
type AnswerRow = ImportedTestForReview["answers"][number];

function parseGroupJson(group: GroupRow): ImportedQuestionGroupJson {
  return importedQuestionGroupJsonSchema.parse(group.questionsJson);
}

function allQuestionNumbers(passages: PassageRow[]): number[] {
  const nums = new Set<number>();
  for (const p of passages) {
    for (const g of p.questionGroups) {
      for (let n = g.startNumber; n <= g.endNumber; n++) nums.add(n);
    }
  }
  return [...nums].sort((a, b) => a - b);
}

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
// Answer key
// ---------------------------------------------------------------------------

function AnswerKeyRow({ importedTestId, questionNumber, initialAnswer }: { importedTestId: string; questionNumber: number; initialAnswer: string }) {
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
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-10 shrink-0 text-right text-xs font-medium">#{questionNumber}</span>
      <Input
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setSaved(false);
        }}
        placeholder="No answer detected"
        className="h-8 text-sm"
      />
      <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={save} disabled={pending || saved}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className={saved ? "text-muted-foreground size-3.5" : "size-3.5"} />}
      </Button>
      {!saved && !value.trim() && <AlertTriangle className="text-amber-500 size-3.5 shrink-0" aria-label="Missing answer" />}
    </div>
  );
}

function AnswerKeySection({ importedTestId, passages, answers }: { importedTestId: string; passages: PassageRow[]; answers: AnswerRow[] }) {
  const answerByNumber = useMemo(() => new Map(answers.map((a) => [a.questionNumber, a.answerText])), [answers]);
  const numbers = useMemo(() => allQuestionNumbers(passages), [passages]);
  const missingCount = numbers.filter((n) => !answerByNumber.get(n)).length;

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
          {numbers.map((n) => (
            <AnswerKeyRow key={n} importedTestId={importedTestId} questionNumber={n} initialAnswer={answerByNumber.get(n) ?? ""} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Question group
// ---------------------------------------------------------------------------

function ImportedQuestionGroupCard({
  importedTestId,
  group,
  onDeleted,
}: {
  importedTestId: string;
  group: GroupRow;
  onDeleted: () => void;
}) {
  const json = useMemo(() => parseGroupJson(group), [group]);
  const [instructions, setInstructions] = useState(group.instructions);
  const [summaryText, setSummaryText] = useState(json.summaryText ?? "");
  const [items, setItems] = useState(json.items);
  const [pending, startTransition] = useTransition();
  const meta = QUESTION_TYPE_META[group.questionType as QuestionType];

  function save() {
    startTransition(async () => {
      const result = await updateImportedQuestionGroupAction(importedTestId, group.id, {
        instructions,
        summaryText: group.questionType === "SUMMARY_COMPLETION" ? summaryText : undefined,
        items: items.length > 0 ? items : undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Question group saved.");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteImportedQuestionGroupAction(importedTestId, group.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onDeleted();
    });
  }

  return (
    <Card className="bg-secondary/20">
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="accent">
              Questions {group.startNumber}-{group.endNumber}
            </Badge>
            <span className="text-muted-foreground text-xs">{meta.label}</span>
          </div>
          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive size-7" onClick={remove} disabled={pending}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Instructions</Label>
          <Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={2} className="text-sm" />
        </div>

        {group.questionType === "SUMMARY_COMPLETION" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Summary text (blanks shown as [number])</Label>
            <Textarea value={summaryText} onChange={(event) => setSummaryText(event.target.value)} rows={4} className="text-sm" />
          </div>
        )}

        {group.questionType === "MATCHING" && (
          <div className="text-muted-foreground space-y-1 text-xs">
            <p>{json.matchingPrompts.length} items to match against {json.matchingOptions.length} options — edit the answer key below; use the test editor after import for deeper changes.</p>
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
  onPassageDeleted,
  onGroupDeleted,
}: {
  importedTestId: string;
  passage: PassageRow;
  onPassageDeleted: () => void;
  onGroupDeleted: (groupId: string) => void;
}) {
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
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteImportedPassageAction(importedTestId, passage.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onPassageDeleted();
    });
  }

  return (
    <AccordionItem value={passage.id}>
      <AccordionTrigger>
        <span className="flex items-center gap-2">
          {title || "Untitled passage"}
          <Badge variant="outline" className="text-[11px]">
            {passage.questionGroups.length} question group{passage.questionGroups.length === 1 ? "" : "s"}
          </Badge>
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
              <ImportedQuestionGroupCard
                key={group.id}
                importedTestId={importedTestId}
                group={group}
                onDeleted={() => onGroupDeleted(group.id)}
              />
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

function ConfirmImportPanel({ importedTestId, defaultTitle }: { importedTestId: string; defaultTitle: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"GENERAL" | "CAMBRIDGE">("GENERAL");
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (title.trim().length < 3) {
      toast.error("Title must be at least 3 characters.");
      return;
    }
    startTransition(async () => {
      const result = await confirmImportAction(importedTestId, { title: title.trim(), description: description.trim() || undefined, category });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.unmatchedAnswerCount > 0) {
        toast.warning(`Imported — but ${result.unmatchedAnswerCount} question${result.unmatchedAnswerCount === 1 ? "" : "s"} had no detected answer. Review before publishing.`);
      } else {
        toast.success("Test imported.");
      }
      router.push(`/teacher/tests/${result.mockTestId}`);
    });
  }

  return (
    <Card className="border-accent/40">
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
        <Button onClick={confirm} disabled={pending} className="w-full">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Import Test
        </Button>
        <p className="text-muted-foreground text-xs">
          This creates a real test from the reviewed content above — it won&apos;t be published until you publish it from the test editor.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Import summary — real counts from the actually-loaded data, never fixed/fake numbers.
// ---------------------------------------------------------------------------

function ImportSummaryStats({ passages, answerCount }: { passages: PassageRow[]; answerCount: number }) {
  const passageCount = passages.length;
  const groupCount = passages.reduce((sum, p) => sum + p.questionGroups.length, 0);
  const questionCount = allQuestionNumbers(passages).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card className="py-3.5">
        <CardContent className="space-y-0.5 px-4 text-center">
          <p className="text-muted-foreground text-[11px] font-medium">Passages found</p>
          <p className="font-display text-lg font-medium">{passageCount}</p>
        </CardContent>
      </Card>
      <Card className="py-3.5">
        <CardContent className="space-y-0.5 px-4 text-center">
          <p className="text-muted-foreground text-[11px] font-medium">Question groups</p>
          <p className="font-display text-lg font-medium">{groupCount}</p>
        </CardContent>
      </Card>
      <Card className="py-3.5">
        <CardContent className="space-y-0.5 px-4 text-center">
          <p className="text-muted-foreground text-[11px] font-medium">Questions found</p>
          <p className="font-display text-lg font-medium">{questionCount}</p>
        </CardContent>
      </Card>
      <Card className="py-3.5">
        <CardContent className="space-y-0.5 px-4 text-center">
          <p className="text-muted-foreground text-[11px] font-medium">Answers found</p>
          <p className="font-display text-lg font-medium">
            {answerCount}
            {answerCount < questionCount && <span className="text-amber-600 text-sm"> /{questionCount}</span>}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function PdfTestImportReviewer({ importedTest }: { importedTest: ImportedTestForReview }) {
  const router = useRouter();
  const [passages, setPassages] = useState(importedTest.passages);
  const [titleSaving, startTitleTransition] = useTransition();
  const [title, setTitle] = useState(importedTest.title ?? importedTest.sourceFileName);

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
            <Button size="sm" variant="outline" onClick={saveTitle} disabled={titleSaving}>
              {titleSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ImportSummaryStats passages={passages} answerCount={importedTest.answers.length} />

      {passages.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm">
            <p className="text-muted-foreground">No passages left to import — every passage was deleted.</p>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" defaultValue={passages.map((p) => p.id)}>
          {passages.map((passage) => (
            <ImportedPassageCard
              key={passage.id}
              importedTestId={importedTest.id}
              passage={passage}
              onPassageDeleted={() => setPassages((prev) => prev.filter((p) => p.id !== passage.id))}
              onGroupDeleted={(groupId) =>
                setPassages((prev) => prev.map((p) => (p.id === passage.id ? { ...p, questionGroups: p.questionGroups.filter((g) => g.id !== groupId) } : p)))
              }
            />
          ))}
        </Accordion>
      )}

      <AnswerKeySection importedTestId={importedTest.id} passages={passages} answers={importedTest.answers} />

      <ConfirmImportPanel importedTestId={importedTest.id} defaultTitle={title} />
    </div>
  );
}
