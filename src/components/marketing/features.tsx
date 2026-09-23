"use client";

import { motion } from "framer-motion";
import { Headphones, BookOpen, PenLine, ClipboardCheck, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";

const FEATURES = [
  {
    icon: Headphones,
    title: "Listening",
    description: "Audio comprehension sets scored against real IELTS band descriptors.",
  },
  {
    icon: BookOpen,
    title: "Reading",
    description: "Timed Academic and General Training passages.",
  },
  {
    icon: PenLine,
    title: "Writing",
    description: "Task 1 & 2 responses, reviewed personally by your teacher.",
  },
  {
    icon: ClipboardCheck,
    title: "Full Mock Test",
    description: "The complete exam experience, under real timing.",
  },
  {
    icon: ShieldCheck,
    title: "Real progress only",
    description: "Every score and stat reflects your actual test history — nothing simulated.",
  },
];

export function MarketingFeatures() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20 sm:pb-28">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: index * 0.06, ease: "easeOut" }}
          >
            <Card className="h-full gap-4 py-6">
              <div className="px-6">
                <span className="bg-secondary text-accent flex size-11 items-center justify-center rounded-xl">
                  <feature.icon className="size-5.5" strokeWidth={1.75} />
                </span>
              </div>
              <div className="space-y-1.5 px-6">
                <h3 className="font-display text-lg font-medium">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
