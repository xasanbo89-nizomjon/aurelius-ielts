"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mic, ArrowRight, Sparkles, Send } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function SpeakingHubCard({
  title = "Speaking",
  description = "Practice your speaking skills for the IELTS exam.",
  href = "/student/speaking-practice",
}: {
  title?: string;
  description?: string;
  href?: string;
}) {
  const router = useRouter();
  const [customQuestion, setCustomQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { isDark } = useTheme();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = customQuestion.trim();
    setSubmitting(true);
    if (trimmed) {
      router.push(`/student/speaking-practice/record?custom=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/student/speaking-practice/record");
    }
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1",
        isDark
          ? "border border-slate-800 bg-slate-900/40 shadow-lg hover:border-blue-500/40 hover:bg-slate-900/60"
          : "border border-slate-300/60 bg-[#f8fafc]/85 shadow-[0_10px_30px_-6px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] text-slate-800 hover:border-blue-300 hover:bg-[#f1f5f9]/90 hover:shadow-[0_16px_40px_-6px_rgba(15,23,42,0.1)]"
      )}
    >
      {/* Ambient corner glow */}
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 size-40 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-100",
          isDark ? "bg-blue-600/10" : "bg-blue-100/50"
        )}
      />

      <div>
        {/* Top Icon & Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <span
            className={cn(
              "relative flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-md transition-all duration-300",
              isDark
                ? "border-blue-500/30 bg-blue-950/40 text-blue-400"
                : "border-blue-200 bg-blue-50 text-blue-700 shadow-xs"
            )}
          >
            <Mic className="size-6 sm:size-7 drop-shadow-xs" strokeWidth={1.75} />
          </span>
          <Link
            href={href}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold transition-colors",
              isDark
                ? "text-blue-400 hover:text-blue-300"
                : "text-blue-600 hover:text-blue-800"
            )}
          >
            <span>Open Practice</span>
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Title and Description */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className={cn(
                "font-display text-xl sm:text-2xl font-bold tracking-tight transition-colors",
                isDark ? "text-slate-100" : "text-blue-950"
              )}
            >
              {title}
            </h3>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 flex items-center gap-1">
              <Sparkles className="size-2.5" /> Live AI Examiner
            </span>
          </div>
          <p
            className={cn(
              "text-xs sm:text-sm leading-relaxed",
              isDark ? "text-slate-300" : "text-slate-600"
            )}
          >
            {description}
          </p>
        </div>
      </div>

      {/* Integrated Custom Question Input Field */}
      <div
        className={cn(
          "mt-6 pt-5 border-t",
          isDark ? "border-slate-800" : "border-slate-200"
        )}
      >
        <label
          htmlFor="custom-speaking-prompt"
          className={cn(
            "mb-2 flex items-center gap-1.5 text-xs font-medium",
            isDark ? "text-slate-300" : "text-slate-700"
          )}
        >
          <Sparkles className="size-3.5 text-blue-600 dark:text-blue-400" />
          <span>Enter Your Custom IELTS Speaking Question Here:</span>
        </label>

        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            id="custom-speaking-prompt"
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="e.g. Describe a challenge you overcame..."
            disabled={submitting}
            className={cn(
              "w-full rounded-xl py-2.5 pr-24 pl-3.5 text-xs sm:text-sm transition-all duration-200 outline-none",
              isDark
                ? "border border-slate-700 bg-slate-950/50 text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 backdrop-blur-md"
                : "border border-slate-300/70 bg-[#edf2f7]/80 text-slate-800 placeholder:text-slate-500/70 focus:border-blue-500 focus:bg-white/90 focus:ring-2 focus:ring-blue-500/20"
            )}
          />

          <div className="absolute right-1.5 flex items-center gap-1">
            <button
              type="submit"
              disabled={submitting}
              title="Start Practice with this Question"
              className={cn(
                "group/btn flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 outline-none",
                "border border-blue-500 bg-blue-600 text-white shadow-xs hover:bg-blue-700 active:scale-95"
              )}
            >
              <Mic className="size-3.5 group-hover/btn:scale-110 transition-transform" />
              <Send className="size-3" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
