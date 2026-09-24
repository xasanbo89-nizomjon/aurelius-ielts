import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Aurelius IELTS",
    template: "%s · Aurelius IELTS",
  },
  description:
    "A premium IELTS learning platform for students and teachers — Listening, Reading, Writing, and full mock tests with real, verified progress tracking.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    // "Add to Home Screen" launches full-screen without Safari chrome, and
    // this exact title is what shows under the icon on the iOS home screen.
    capable: true,
    statusBarStyle: "default",
    title: "Aurelius",
  },
  other: {
    // Next's typed `appleWebApp.capable` only emits the newer standardized
    // "mobile-web-app-capable" tag — this is the older, iOS-Safari-specific
    // one, still what's most reliably recognized for "launch full-screen,
    // no browser chrome" across the actual range of iOS Safari versions.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets content extend under the iPhone notch/home-indicator area instead
  // of leaving black bars — safe-area-inset-* env() vars (already used
  // nowhere yet, but now available) are how a page opts back into padding
  // around it where needed.
  viewportFit: "cover",
  themeColor: "#211d17",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          {children}
          <Toaster />
        </Providers>
        <PwaRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
