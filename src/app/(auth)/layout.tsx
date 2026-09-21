import type { ReactNode } from "react";
import Link from "next/link";
import { GraduationCap, Quote } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background grid min-h-svh lg:grid-cols-2">
      <div className="bg-primary text-primary-foreground relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <Link href="/" className="relative flex items-center gap-2.5">
          <span className="bg-primary-foreground text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
            <GraduationCap className="size-5" strokeWidth={1.75} />
          </span>
          <span className="font-display text-lg leading-none font-medium tracking-tight">
            Aurelius IELTS
          </span>
        </Link>

        <div className="relative max-w-md space-y-6">
          <Quote className="text-accent size-9" strokeWidth={1.25} />
          <p className="font-display text-3xl leading-snug font-normal tracking-tight text-balance">
            A calmer way to prepare for IELTS — real feedback, real progress, no guesswork.
          </p>
          <p className="text-primary-foreground/60 text-sm">
            Built for students and teachers who take preparation seriously.
          </p>
        </div>

        <p className="text-primary-foreground/40 relative text-xs">
          © {new Date().getFullYear()} Aurelius IELTS. All rights reserved.
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
