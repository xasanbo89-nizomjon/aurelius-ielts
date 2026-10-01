"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Phase 49 — wraps next/image for real, user-uploaded paths (cover images,
 * attachments, media library files — never a bundled app asset) with a
 * graceful fallback. If the underlying file was deleted from storage or the
 * path is stale, shows a neutral "image unavailable" placeholder instead of
 * the browser's broken-image glyph. A plain presentational swap, not a
 * retry — the real file either loads or it doesn't.
 */
export function FallbackImage({ className, alt, ...props }: ImageProps) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div
        className={cn("bg-secondary text-muted-foreground flex items-center justify-center", props.fill && "absolute inset-0", className)}
        role="img"
        aria-label={alt || "Image unavailable"}
      >
        <ImageOff className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </div>
    );
  }

  return <Image alt={alt} className={className} onError={() => setErrored(true)} {...props} />;
}
