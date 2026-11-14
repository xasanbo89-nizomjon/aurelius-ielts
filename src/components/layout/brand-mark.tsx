"use client";

import Link from "next/link";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function BrandMark({ href = "/", className }: { href?: string; className?: string }) {
  const { isDark } = useTheme();

  return (
    <Link
      href={href}
      className={cn("group flex items-center gap-3 transition-transform hover:scale-[1.02]", className)}
      aria-label="Aurelius IELTS Home"
    >
      {/* Golden Laurel Wreath Crest with Letter "A" and Crown */}
      <div className="relative flex size-11 sm:size-12 shrink-0 items-center justify-center">
        <svg
          viewBox="0 0 100 100"
          className="size-full drop-shadow-[0_0_10px_rgba(245,158,11,0.6)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fff2a8" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Mini Imperial Crown above "A" */}
          <path
            d="M40 23 L44 28 L50 20 L56 28 L60 23 L58 31 L42 31 Z"
            fill="url(#goldGradient)"
            filter="url(#goldGlow)"
          />
          <circle cx="40" cy="22" r="1.5" fill="#fff" />
          <circle cx="50" cy="19" r="1.8" fill="#fff" />
          <circle cx="60" cy="22" r="1.5" fill="#fff" />

          {/* Center Serif Letter "A" */}
          <text
            x="50"
            y="61"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontSize="34"
            fontWeight="bold"
            fontStyle="italic"
            fill="url(#goldGradient)"
            filter="url(#goldGlow)"
          >
            A
          </text>

          {/* Left Laurel Wreath Branch */}
          <g fill="url(#goldGradient)" opacity="0.95">
            <path d="M 28 35 C 24 38, 20 45, 20 54 C 20 64, 25 72, 33 78 C 31 76, 29 70, 29 64 C 29 55, 33 46, 37 39 Z" />
            {/* Laurel Leaves (Left) */}
            <ellipse cx="23" cy="40" rx="3.5" ry="7" transform="rotate(-35 23 40)" />
            <ellipse cx="18" cy="48" rx="3.5" ry="7" transform="rotate(-15 18 48)" />
            <ellipse cx="18" cy="58" rx="3.5" ry="7" transform="rotate(15 18 58)" />
            <ellipse cx="22" cy="67" rx="3.5" ry="7" transform="rotate(40 22 67)" />
            <ellipse cx="30" cy="74" rx="3.5" ry="7" transform="rotate(65 30 74)" />
            <ellipse cx="40" cy="79" rx="3.5" ry="7" transform="rotate(85 40 79)" />
          </g>

          {/* Right Laurel Wreath Branch */}
          <g fill="url(#goldGradient)" opacity="0.95">
            <path d="M 72 35 C 76 38, 80 45, 80 54 C 80 64, 75 72, 67 78 C 69 76, 71 70, 71 64 C 71 55, 67 46, 63 39 Z" />
            {/* Laurel Leaves (Right) */}
            <ellipse cx="77" cy="40" rx="3.5" ry="7" transform="rotate(35 77 40)" />
            <ellipse cx="82" cy="48" rx="3.5" ry="7" transform="rotate(15 82 48)" />
            <ellipse cx="82" cy="58" rx="3.5" ry="7" transform="rotate(-15 82 58)" />
            <ellipse cx="78" cy="67" rx="3.5" ry="7" transform="rotate(-40 78 67)" />
            <ellipse cx="70" cy="74" rx="3.5" ry="7" transform="rotate(-65 70 74)" />
            <ellipse cx="60" cy="79" rx="3.5" ry="7" transform="rotate(-85 60 79)" />
          </g>

          {/* Ribbon Tie at Bottom */}
          <circle cx="50" cy="80" r="3" fill="url(#goldGradient)" />
        </svg>
      </div>

      {/* Two-line Golden Typography: "Aurelius" on top, "IELTS" below */}
      <div className="flex flex-col text-left leading-none">
        <span
          className={cn(
            "font-serif text-base sm:text-lg font-bold tracking-wide transition-colors",
            isDark
              ? "text-[#fef08a] drop-shadow-[0_2px_10px_rgba(254,240,138,0.5)]"
              : "text-slate-900"
          )}
        >
          Aurelius
        </span>
        <span
          className={cn(
            "font-display text-sm sm:text-base font-black tracking-widest transition-colors",
            isDark
              ? "text-[#f59e0b] drop-shadow-[0_2px_12px_rgba(245,158,11,0.6)]"
              : "text-amber-700"
          )}
        >
          IELTS
        </span>
      </div>
    </Link>
  );
}
