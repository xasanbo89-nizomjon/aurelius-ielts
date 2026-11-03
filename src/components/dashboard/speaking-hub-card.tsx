"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mic, ArrowRight, Sparkles, Send } from "lucide-react";

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
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-500/20 bg-[#131622]/30 p-6 sm:p-8 backdrop-blur-xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:border-amber-400/40 hover:bg-[#131622]/40 hover:shadow-[0_18px_50px_-5px_rgba(0,0,0,0.8),0_0_25px_rgba(217,178,86,0.15)] hover:-translate-y-1">
      {/* Soft warm ambient corner glow that lets space nebula shine through */}
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-amber-500/[0.12] blur-3xl transition-opacity duration-300 group-hover:opacity-100" />

      <div>
        {/* Top Icon & Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <span className="relative flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent text-amber-300/95 shadow-[0_0_16px_rgba(245,158,11,0.22)] backdrop-blur-md">
            <Mic className="size-6 sm:size-7 text-amber-300/95 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" strokeWidth={1.75} />
          </span>
          <Link
            href={href}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-300/80 hover:text-amber-200 transition-colors"
          >
            <span>Open Practice</span>
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Title and Description */}
        <div className="space-y-1.5">
          <h3 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-amber-100/95">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-amber-200/70 leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {/* Integrated Custom Question Input Field */}
      <div className="mt-6 pt-5 border-t border-amber-500/15">
        <label
          htmlFor="custom-speaking-prompt"
          className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-200/90"
        >
          <Sparkles className="size-3.5 text-amber-400" />
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
            className="w-full rounded-xl border border-amber-500/25 bg-[#0a0d14]/40 py-2.5 pr-24 pl-3.5 text-xs sm:text-sm text-amber-100/95 placeholder:text-amber-200/35 backdrop-blur-md transition-all duration-200 outline-none focus:border-amber-400/60 focus:bg-[#0a0d14]/60 focus:ring-2 focus:ring-amber-500/20"
          />

          <div className="absolute right-1.5 flex items-center gap-1">
            <button
              type="submit"
              disabled={submitting}
              title="Start Practice with this Question"
              className="group/btn flex items-center gap-1 rounded-lg border border-amber-400/35 bg-gradient-to-r from-amber-500/25 via-amber-400/20 to-amber-600/25 px-2.5 py-1.5 text-xs font-semibold text-amber-200/95 shadow-[0_0_12px_rgba(245,158,11,0.2)] backdrop-blur-sm transition-all duration-200 hover:border-amber-400/70 hover:from-amber-500/40 hover:to-amber-600/40 hover:text-amber-100"
            >
              <Mic className="size-3.5 text-amber-300 group-hover/btn:scale-110 transition-transform" />
              <Send className="size-3 text-amber-300" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
