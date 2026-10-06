"use client";

import { useState } from "react";
import { Eye, RotateCcw } from "lucide-react";

import "@/components/exam/official/official-exam.css";
import type { PreviewGroupInfo, PreviewRow } from "@/lib/exam/builder-model";
import { OfficialQuestionGroups, type OfficialRow } from "@/components/exam/official/official-questions";
import { Button } from "@/components/ui/button";

/**
 * "As the student sees it": the REAL question renderer of the official exam screen, fed the rows a save would store and numbered by the student's own
 * numbering. Answers can be typed here (so a blank can be tried) but nothing is saved - they live in this component only.
 */
export function GroupPreview({ rows, info }: { rows: PreviewRow[]; info: PreviewGroupInfo }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  return (
    <div className="border-border/70 bg-secondary/20 space-y-2 rounded-xl border p-3" data-testid="group-preview">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <Eye className="size-3.5" /> As the student sees it (nothing here is saved)
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAnswers({})}>
          <RotateCcw className="size-3.5" /> Clear
        </Button>
      </div>
      <div className="ex-scope ex-questions" style={{ position: "static", overflow: "visible", padding: "0.75rem 1rem", borderRadius: "0.5rem", fontSize: "15px" }}>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Add a question to see it here.</p>
        ) : (
          <OfficialQuestionGroups rows={rows as unknown as OfficialRow[]} groups={[info]} answers={answers} onAnswer={(questionId, value) => setAnswers((prev) => ({ ...prev, [questionId]: value }))} />
        )}
      </div>
    </div>
  );
}
