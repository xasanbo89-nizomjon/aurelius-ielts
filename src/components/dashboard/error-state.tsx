import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this page. Please try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-destructive/25 bg-destructive/5 flex flex-col items-center justify-center gap-3 rounded-2xl border px-6 py-16 text-center"
    >
      <span className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-2xl">
        <AlertTriangle className="size-6" strokeWidth={1.5} />
      </span>
      <div className="max-w-sm space-y-1">
        <h3 className="font-display text-base font-medium">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
