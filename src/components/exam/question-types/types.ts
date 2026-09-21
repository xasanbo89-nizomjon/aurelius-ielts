import { cn } from "@/lib/utils";

export const optionRowClass = cn(
  "border-border bg-card hover:bg-secondary/50 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition-colors",
  "has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-secondary",
  "has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
);

export type QuestionAnswerProps<TOptions, TValue> = {
  questionId: string;
  options: TOptions;
  value: TValue | undefined;
  onChange: (value: TValue) => void;
};
