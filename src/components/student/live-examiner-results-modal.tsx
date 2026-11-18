"use client";

import { useState } from "react";
import {
  Award,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Volume2,
  Copy,
  Check,
  RotateCcw,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LiveEvaluationResult } from "@/actions/live-examiner.actions";

interface LiveExaminerResultsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluation: LiveEvaluationResult | null;
  onRestart: () => void;
}

export function LiveExaminerResultsModal({
  open,
  onOpenChange,
  evaluation,
  onRestart,
}: LiveExaminerResultsModalProps) {
  const [copied, setCopied] = useState(false);

  if (!evaluation) return null;

  const getBandLabel = (score: number) => {
    if (score >= 8.5) return "Expert User";
    if (score >= 7.5) return "Very Good User";
    if (score >= 6.5) return "Competent / Good User";
    if (score >= 5.5) return "Modest User";
    return "Developing User";
  };

  const handleCopyFeedback = async () => {
    const text = `🎯 Aurelius IELTS - AI Live Examiner Result
Overall Band Score: ${evaluation.bandScore} (${getBandLabel(evaluation.bandScore)})
• Fluency & Coherence: ${evaluation.fluencyBand}
• Lexical Resource: ${evaluation.lexicalBand}
• Grammar Range & Accuracy: ${evaluation.grammarBand}
• Pronunciation: ${evaluation.pronunciationBand}

📝 Examiner Summary:
${evaluation.summaryFeedback}

✅ Strengths:
${evaluation.strengths.map((s) => `• ${s}`).join("\n")}

⚠️ Areas to Improve:
${evaluation.weaknesses.map((w) => `• ${w}`).join("\n")}

💡 Key Phrasing Improvements:
${evaluation.corrections
  .map((c) => `• "${c.original}" ➔ "${c.improved}" (${c.explanation})`)
  .join("\n")}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 border-blue-200/80 bg-white dark:bg-slate-900 shadow-2xl rounded-2xl">
        {/* Header Banner */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-6 text-white">
          <div className="absolute -top-10 -right-10 size-40 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-blue-700/80 hover:bg-blue-700 text-blue-100 border-none font-medium px-2.5 py-0.5 text-xs">
                  <Sparkles className="size-3 mr-1 inline text-blue-200" />
                  Official Band Descriptors
                </Badge>
                <span className="text-xs text-blue-200/80">Examiner Sarah · Certified AI</span>
              </div>
              <DialogTitle className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-white">
                Speaking Assessment
              </DialogTitle>
              <DialogDescription className="text-blue-100/90 text-sm mt-1">
                Diagnostic report based on your live interview responses.
              </DialogDescription>
            </div>

            {/* Big Band Score Circle */}
            <div className="flex items-center sm:flex-col justify-between sm:justify-center bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-3 sm:py-4 text-center shrink-0">
              <span className="text-xs uppercase tracking-wider text-blue-200 font-semibold">Overall Band</span>
              <div className="flex items-baseline gap-1 my-0.5">
                <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                  {evaluation.bandScore.toFixed(1)}
                </span>
                <span className="text-sm font-medium text-blue-200">/ 9.0</span>
              </div>
              <span className="text-xs font-medium text-blue-100">{getBandLabel(evaluation.bandScore)}</span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* 4 Official IELTS Criteria Scores */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-900/70 dark:text-blue-300/70 mb-3 flex items-center gap-1.5">
              <Award className="size-4 text-blue-600" /> 4 Band Assessment Criteria
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-slate-800/60 border border-blue-100 dark:border-slate-700 text-center">
                <p className="text-[11px] font-medium text-blue-800/80 dark:text-blue-300">Fluency & Coherence</p>
                <p className="text-2xl font-bold text-blue-950 dark:text-blue-100 mt-1">
                  {evaluation.fluencyBand.toFixed(1)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-slate-800/60 border border-blue-100 dark:border-slate-700 text-center">
                <p className="text-[11px] font-medium text-blue-800/80 dark:text-blue-300">Lexical Resource</p>
                <p className="text-2xl font-bold text-blue-950 dark:text-blue-100 mt-1">
                  {evaluation.lexicalBand.toFixed(1)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-slate-800/60 border border-blue-100 dark:border-slate-700 text-center">
                <p className="text-[11px] font-medium text-blue-800/80 dark:text-blue-300">Grammar & Accuracy</p>
                <p className="text-2xl font-bold text-blue-950 dark:text-blue-100 mt-1">
                  {evaluation.grammarBand.toFixed(1)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-slate-800/60 border border-blue-100 dark:border-slate-700 text-center">
                <p className="text-[11px] font-medium text-blue-800/80 dark:text-blue-300">Pronunciation</p>
                <p className="text-2xl font-bold text-blue-950 dark:text-blue-100 mt-1">
                  {evaluation.pronunciationBand.toFixed(1)}
                </p>
              </div>
            </div>
          </div>

          {/* Examiner Summary */}
          <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/50">
            <h4 className="text-sm font-semibold text-blue-950 dark:text-blue-100 mb-1.5 flex items-center gap-2">
              <Volume2 className="size-4 text-blue-700 dark:text-blue-400" />
              Examiner Sarah&apos;s Feedback
            </h4>
            <p className="text-sm leading-relaxed text-blue-900/90 dark:text-blue-200/90">
              {evaluation.summaryFeedback}
            </p>
            <div className="mt-3 flex items-center gap-4 text-xs text-blue-800/70 dark:text-blue-300/70 pt-2 border-t border-blue-200/60 dark:border-blue-800/40">
              <span>🗣️ Total Words Spoken: <strong>{evaluation.candidateWordCount}</strong></span>
              <span>💬 Question Turns: <strong>{evaluation.responseCount}</strong></span>
            </div>
          </div>

          {/* Strengths & Weaknesses Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/40">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mb-2.5 flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" /> Key Strengths
              </h5>
              <ul className="space-y-2">
                {evaluation.strengths.map((str, idx) => (
                  <li key={idx} className="text-xs leading-relaxed text-emerald-950 dark:text-emerald-200 flex items-start gap-2">
                    <span className="text-emerald-600 font-bold shrink-0 mt-0.5">•</span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200/70 dark:border-sky-800/40">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-sky-800 dark:text-sky-300 mb-2.5 flex items-center gap-1.5">
                <AlertCircle className="size-4 text-sky-600" /> Areas for Improvement
              </h5>
              <ul className="space-y-2">
                {evaluation.weaknesses.map((weak, idx) => (
                  <li key={idx} className="text-xs leading-relaxed text-sky-950 dark:text-sky-200 flex items-start gap-2">
                    <span className="text-sky-600 font-bold shrink-0 mt-0.5">•</span>
                    <span>{weak}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* High-Value Corrections */}
          {evaluation.corrections.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-900/70 dark:text-blue-300/70 mb-3 flex items-center gap-1.5">
                <BookOpen className="size-4 text-blue-600" /> Band 8.0+ Phrasing Improvements
              </h4>
              <div className="space-y-3">
                {evaluation.corrections.map((corr, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-blue-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2 text-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                      <div className="line-through text-rose-600/90 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/40 px-2 py-1 rounded">
                        &ldquo;{corr.original}&rdquo;
                      </div>
                      <ArrowRight className="size-3.5 text-blue-400 shrink-0 hidden sm:block" />
                      <div className="text-blue-950 dark:text-blue-100 font-semibold bg-blue-100/60 dark:bg-blue-900/40 px-2 py-1 rounded flex items-center gap-1.5">
                        <Sparkles className="size-3 text-blue-600" />
                        &ldquo;{corr.improved}&rdquo;
                      </div>
                    </div>
                    <p className="text-muted-foreground text-[11px] italic pl-1">
                      💡 {corr.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <DialogFooter className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/80 border-t border-blue-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyFeedback}
            className="text-xs gap-1.5 text-blue-950 dark:text-blue-100 border-blue-200"
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            {copied ? "Copied to Clipboard" : "Copy Feedback"}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onRestart();
              }}
              className="text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow"
            >
              <RotateCcw className="size-3.5" />
              Practice Again
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
