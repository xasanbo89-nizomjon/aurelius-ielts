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
          ? "border border-amber-500/20 bg-slate-950/30 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-amber-400/40 hover:bg-slate-950/40 hover:shadow-[0_18px_50px_-5px_rgba(0,0,0,0.8),0_0_25px_rgba(217,178,86,0.15)]"
          : "border border-sky-200/70 bg-white/60 shadow-[0_12px_35px_-8px_rgba(30,64,175,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] hover:border-sky-300/80 hover:bg-white/70 hover:shadow-[0_18px_45px_-5px_rgba(30,64,175,0.14)]"
      )}
    >
      {/* Ambient corner glow letting the theme background shine through */}
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 size-40 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-100",
          isDark ? "bg-amber-500/[0.15]" : "bg-sky-400/[0.18]"
        )}
      />

      <div>
        {/* Top Icon & Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <span
            className={cn(
              "relative flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-md transition-all duration-300",
              isDark
                ? "border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent text-amber-300/95 shadow-[0_0_16px_rgba(245,158,11,0.22)]"
                : "border-amber-400/40 bg-amber-50 text-amber-700 shadow-sm"
            )}
          >
            <Mic className="size-6 sm:size-7 drop-shadow-sm" strokeWidth={1.75} />
          </span>
          <Link
            href={href}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold transition-colors",
              isDark
                ? "text-amber-300/80 hover:text-amber-200"
                : "text-amber-700 hover:text-amber-800"
            )}
          >
            <span>Open Practice</span>
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Title and Description */}
        <div className="space-y-1.5">
          <h3
            className={cn(
              "font-display text-xl sm:text-2xl font-semibold tracking-tight",
              isDark ? "text-amber-100/95" : "text-slate-900"
            )}
          >
            {title}
          </h3>
          <p
            className={cn(
              "text-xs sm:text-sm leading-relaxed",
              isDark ? "text-amber-200/70" : "text-slate-600"
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
          isDark ? "border-amber-500/15" : "border-slate-200/70"
        )}
      >
        <label
          htmlFor="custom-speaking-prompt"
          className={cn(
            "mb-2 flex items-center gap-1.5 text-xs font-medium",
            isDark ? "text-amber-200/90" : "text-slate-700"
          )}
        >
          <Sparkles className={cn("size-3.5", isDark ? "text-amber-400" : "text-amber-600")} />
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
              "w-full rounded-xl py-2.5 pr-24 pl-3.5 text-xs sm:text-sm backdrop-blur-md transition-all duration-200 outline-none",
              isDark
                ? "border border-amber-500/25 bg-[#0a0d14]/30 text-amber-100/95 placeholder:text-amber-200/35 focus:border-amber-400/60 focus:bg-[#0a0d14]/50 focus:ring-2 focus:ring-amber-500/20"
                : "border border-slate-300/80 bg-white/70 text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
            )}
          />

          <div className="absolute right-1.5 flex items-center gap-1">
            <button
              type="submit"
              disabled={submitting}
              title="Start Practice with this Question"
              className={cn(
                "group/btn flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold backdrop-blur-sm transition-all duration-200 outline-none",
                isDark
                  ? "border border-amber-400/35 bg-gradient-to-r from-amber-500/25 via-amber-400/20 to-amber-600/25 text-amber-200/95 shadow-[0_0_12px_rgba(245,158,11,0.2)] hover:border-amber-400/70 hover:from-amber-500/40 hover:to-amber-600/40 hover:text-amber-100"
                  : "border border-amber-500/50 bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm hover:from-amber-600 hover:to-amber-700"
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
