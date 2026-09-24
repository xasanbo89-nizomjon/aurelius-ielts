"use client";

import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";

import { askTeacherAssistantAction } from "@/actions/teacher-assistant.actions";
import type { TeacherAssistantResponse } from "@/lib/ai/prompts/teacher-assistant";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const EXAMPLE_QUESTIONS = [
  "Which students are struggling?",
  "Which students improved this month?",
  "Which skills are weakest?",
  "Which students are inactive?",
  "Which students need attention?",
];

type Exchange = { question: string; answer: TeacherAssistantResponse; studentCount: number };

function AnswerList({ title, items, tone }: { title: string; items: string[]; tone: "destructive" | "success" | "accent" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm">
            <Badge variant={tone} className="mt-0.5 shrink-0">
              •
            </Badge>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TeacherAssistantChat() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);

  async function handleAsk(q?: string) {
    const finalQuestion = (q ?? question).trim();
    if (!finalQuestion) return;

    setLoading(true);
    setError(null);
    const result = await askTeacherAssistantAction({ question: finalQuestion });
    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setExchanges((prev) => [{ question: finalQuestion, answer: result.answer, studentCount: result.studentCount }, ...prev]);
    setQuestion("");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3.5">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleAsk(q)}
                disabled={loading}
                className="bg-secondary text-muted-foreground hover:bg-secondary/70 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about your students' real performance…"
              rows={2}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleAsk();
                }
              }}
            />
            <Button onClick={() => handleAsk()} disabled={loading || !question.trim()}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </CardContent>
      </Card>

      {exchanges.length === 0 && !loading && (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          <Sparkles className="text-accent size-6" aria-hidden="true" />
          <p>Ask a question above — every answer is grounded in your students&apos; real data.</p>
        </div>
      )}

      <div className="space-y-5">
        {exchanges.map((exchange, index) => (
          <Card key={index}>
            <CardContent className="space-y-3.5">
              <p className="font-medium">{exchange.question}</p>
              <p className="text-muted-foreground text-xs">Based on {exchange.studentCount} student{exchange.studentCount === 1 ? "" : "s"}</p>
              <p className="text-sm">{exchange.answer.summary}</p>
              <AnswerList title="Risks" items={exchange.answer.risks} tone="destructive" />
              <AnswerList title="Strengths" items={exchange.answer.strengths} tone="success" />
              <AnswerList title="Recommendations" items={exchange.answer.recommendations} tone="accent" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
