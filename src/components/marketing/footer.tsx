import { BrandMark } from "@/components/layout/brand-mark";

export function MarketingFooter() {
  return (
    <footer className="border-border/70 border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
        <BrandMark />
        <p className="text-muted-foreground text-xs">
          © {new Date().getFullYear()} Aurelius IELTS. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
