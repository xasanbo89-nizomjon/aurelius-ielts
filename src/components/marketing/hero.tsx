"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";

export function MarketingHero() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-20 sm:pt-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-3xl space-y-6 text-center"
      >
        <span className="border-border bg-secondary/60 text-muted-foreground inline-flex items-center rounded-full border px-3.5 py-1 text-xs font-medium">
          For students and teachers preparing for IELTS
        </span>
        <h1 className="font-display text-4xl leading-tight font-medium tracking-tight text-balance sm:text-5xl lg:text-6xl">
          A calmer way to reach your target band score
        </h1>
        <p className="text-muted-foreground mx-auto max-w-xl text-base sm:text-lg">
          Practice all four skills, get real feedback from real teachers, and track progress that
          only moves when you do — no inflated stats, no shortcuts.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/register">Start preparing — it&apos;s free</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">I already have an account</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
