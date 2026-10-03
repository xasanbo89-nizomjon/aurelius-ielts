"use client";

import { Expand } from "lucide-react";

import { cn } from "@/lib/utils";
import { FallbackImage } from "@/components/ui/fallback-image";

/**
 * Phase F — a Writing Task 1 picture (chart, graph, table, map or process
 * diagram) as the student sees it, placed ABOVE the task text.
 *
 * It is laid out at its own proportions — never cropped, never stretched: the
 * stored width and height give the browser the aspect ratio before the file
 * arrives (no layout jump), the picture shrinks to the width of its column on
 * a phone or a narrow panel and is never blown up past its real size, and a
 * very tall picture is capped in height instead of pushing the task out of
 * view. Axis labels can be small on a phone, so the full-size file is one tap away.
 */
export function WritingTaskImageView({
  url,
  width,
  height,
  alt,
  maxHeightClass = "max-h-[70vh]",
  className,
}: {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  /** Tailwind max-height utility for the picture itself. */
  maxHeightClass?: string;
  className?: string;
}) {
  return (
    <figure className={cn("border-border/70 bg-card space-y-1.5 rounded-lg border p-2", className)} data-testid="writing-task-image">
      <div className="bg-secondary/40 flex min-w-0 justify-center rounded-md">
        <FallbackImage
          src={url}
          alt={alt}
          width={width ?? 1200}
          height={height ?? 800}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className={cn("h-auto w-auto max-w-full object-contain", maxHeightClass)}
          unoptimized
          priority
        />
      </div>
      <figcaption className="flex justify-end">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs underline-offset-2 hover:underline"
        >
          <Expand className="size-3" aria-hidden="true" /> Open full size
        </a>
      </figcaption>
    </figure>
  );
}
