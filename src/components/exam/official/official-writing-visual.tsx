"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

/**
 * The Task 1 picture (chart, graph, table, map or process diagram) under the task text on the Writing screen.
 *
 * It sits at its own proportions (never cropped or stretched), and one click opens it large over the exam: "Fit to screen" shows
 * all of it, "Actual size" shows it pixel for pixel and the window scrolls, so small axis labels can always be read. The picture
 * is the file the teacher uploaded for the task (JPG, PNG or WEBP); the large view is drawn inside the exam screen, so it follows
 * the contrast and text-size settings like the submit dialog does.
 */
export function OfficialWritingVisual({ url, width, height, alt, container }: { url: string; width: number | null; height: number | null; alt: string; container: HTMLElement | null }) {
  const [open, setOpen] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (failed) {
    return (
      <figure className="ex-figure ex-writing-figure" data-testid="writing-task-image">
        <p role="alert" style={{ margin: 0, padding: "0.7em" }}>
          The picture could not be loaded.{" "}
          <button
            type="button"
            className="ex-button"
            onClick={() => {
              setFailed(false);
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </button>
        </p>
      </figure>
    );
  }

  const src = attempt > 0 ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url;

  return (
    <figure className="ex-figure ex-writing-figure" data-testid="writing-task-image">
      <button type="button" className="ex-zoom-trigger" onClick={() => setOpen(true)} aria-label="Enlarge the picture" data-testid="writing-image-zoom">
        {/* eslint-disable-next-line @next/next/no-img-element -- a teacher-uploaded file at its own size; the stored width/height keep the layout still while it loads */}
        <img src={src} alt={alt} width={width ?? undefined} height={height ?? undefined} onError={() => setFailed(true)} />
      </button>
      <figcaption>Click the picture to enlarge it.</figcaption>

      <DialogPrimitive.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setActualSize(false);
        }}
      >
        <DialogPrimitive.Portal container={container ?? undefined}>
          <DialogPrimitive.Overlay className="ex-overlay" />
          <DialogPrimitive.Content className="ex-zoom" aria-describedby={undefined} data-testid="writing-image-dialog">
            <div className="ex-zoom-bar">
              <DialogPrimitive.Title className="ex-zoom-title">The picture</DialogPrimitive.Title>
              <button type="button" className="ex-button" onClick={() => setActualSize((value) => !value)} aria-pressed={actualSize} data-testid="writing-image-size">
                {actualSize ? "Fit to screen" : "Actual size"}
              </button>
              <DialogPrimitive.Close className="ex-button" data-testid="writing-image-close">
                Close
              </DialogPrimitive.Close>
            </div>
            <div className="ex-zoom-scroll" data-size={actualSize ? "actual" : "fit"} data-testid="writing-image-scroll">
              {/* eslint-disable-next-line @next/next/no-img-element -- same file, shown large */}
              <img src={src} alt={alt} onClick={() => setActualSize((value) => !value)} />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </figure>
  );
}
