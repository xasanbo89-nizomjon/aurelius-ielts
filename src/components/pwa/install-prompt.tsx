"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/** Chrome/Edge (Android + desktop) fire this instead of navigating — not in TS's standard DOM lib yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const INSTALLED_KEY = "aurelius-pwa-installed";
const DISMISSED_AT_KEY = "aurelius-pwa-install-dismissed-at";
const IOS_DISMISSED_AT_KEY = "aurelius-ios-install-dismissed-at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** iPhone/iPad Safari (and iPadOS 13+, which reports as "MacIntel" but has touch support) — no other reliable iOS signal exists. */
function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/** iOS has no `appinstalled` event at all — the one reliable "already installed" signal is running in standalone display mode right now. */
function isIosStandalone(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Phase 28/32 — Part 4. Two independent install paths, each with its own
 * "never show repeatedly" tracking:
 * - Android/desktop Chrome/Edge: the real `beforeinstallprompt` banner.
 * - iOS Safari: `beforeinstallprompt` never fires there, so a custom modal
 *   walks through the real manual steps instead — iOS gives web apps no
 *   programmatic install trigger at all.
 */
export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [iosEligible, setIosEligible] = useState(false);

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

    // iOS eligibility check — never fires beforeinstallprompt, so this is evaluated once up front instead.
    if (isIos() && !isIosStandalone()) {
      try {
        const iosDismissedAt = Number(localStorage.getItem(IOS_DISMISSED_AT_KEY) ?? 0);
        if (!iosDismissedAt || Date.now() - iosDismissedAt >= DISMISS_COOLDOWN_MS) {
          setIosEligible(true);
        }
      } catch {
        setIosEligible(true);
      }
    }

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

  function dismissIos() {
    setIosEligible(false);
    setShowIosModal(false);
    try {
      localStorage.setItem(IOS_DISMISSED_AT_KEY, String(Date.now()));
    } catch {
      // Best-effort only.
    }
  }

  if (iosEligible && !installed) {
    return (
      <>
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
                  <Button size="sm" onClick={() => setShowIosModal(true)}>
                    Install
                  </Button>
                  <Button size="sm" variant="ghost" onClick={dismissIos}>
                    Not now
                  </Button>
                </div>
              </div>
              <button type="button" onClick={dismissIos} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="size-4" />
              </button>
            </CardContent>
          </Card>
        </div>

        <Dialog open={showIosModal} onOpenChange={(open) => (open ? setShowIosModal(true) : dismissIos())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Aurelius IELTS to your Home Screen</DialogTitle>
              <DialogDescription>iOS doesn&apos;t let apps trigger this automatically — just two taps:</DialogDescription>
            </DialogHeader>
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <span className="bg-secondary text-accent flex size-8 shrink-0 items-center justify-center rounded-lg font-medium">1</span>
                <span className="flex items-center gap-1.5">
                  Tap the Share button <Share className="size-4" strokeWidth={1.75} /> in Safari&apos;s toolbar
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="bg-secondary text-accent flex size-8 shrink-0 items-center justify-center rounded-lg font-medium">2</span>
                <span className="flex items-center gap-1.5">
                  Scroll down and tap <SquarePlus className="size-4" strokeWidth={1.75} /> &quot;Add to Home Screen&quot;
                </span>
              </li>
            </ol>
          </DialogContent>
        </Dialog>
      </>
    );
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
