"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Chrome/Edge (Android + desktop) fire this instead of navigating — not in TS's standard DOM lib yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const INSTALLED_KEY = "aurelius-pwa-installed";
const DISMISSED_AT_KEY = "aurelius-pwa-install-dismissed-at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Phase 28 — Part 8. Real browser-driven install prompt (Android/desktop
 * Chrome/Edge only — `beforeinstallprompt` has no iOS Safari equivalent, so
 * this component simply never fires there rather than faking a prompt).
 * Installation status is tracked in localStorage only (per-device, real —
 * see the artifact-storage rule against inventing server-side state for
 * something the browser itself already reports via `appinstalled`).
 */
export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(INSTALLED_KEY) === "true") setInstalled(true);
      const dismissedAt = Number(localStorage.getItem(DISMISSED_AT_KEY) ?? 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) setDismissed(true);
    } catch {
      // Private browsing / blocked storage — fall back to always eligible.
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    }
    function handleAppInstalled() {
      setInstalled(true);
      setDeferredEvent(null);
      try {
        localStorage.setItem(INSTALLED_KEY, "true");
      } catch {
        // Best-effort only.
      }
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    setDeferredEvent(null);
  }

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    } catch {
      // Best-effort only.
    }
  }

  if (!deferredEvent || installed || dismissed) return null;

  return (
    <div className="fixed right-4 bottom-20 left-4 z-50 sm:right-4 sm:left-auto sm:max-w-sm lg:bottom-4">
      <Card className="shadow-soft-lg">
        <CardContent className="flex items-start gap-3 py-4">
          <span className="bg-secondary text-accent flex size-10 shrink-0 items-center justify-center rounded-xl">
            <Download className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-medium">Install Aurelius IELTS</p>
            <p className="text-muted-foreground text-xs">Add it to your home screen for a faster, app-like experience — works offline too.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleInstall}>
                Install
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismiss}>
                Not now
              </Button>
            </div>
          </div>
          <button type="button" onClick={handleDismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="size-4" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
