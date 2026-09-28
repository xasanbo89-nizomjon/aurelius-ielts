"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { exportReportAction, type ExportFormat, type ExportReportKind } from "@/actions/export.actions";
import { Button } from "@/components/ui/button";

function downloadBase64File(filename: string, mimeType: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Phase 29 — Part 12. Root-only report export, both formats, one small reusable control. */
export function ExportReportButtons({ kind, label }: { kind: ExportReportKind; label: string }) {
  const [pending, setPending] = useState<ExportFormat | null>(null);

  async function handleExport(format: ExportFormat) {
    setPending(format);
    const result = await exportReportAction(kind, format);
    setPending(null);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    downloadBase64File(result.filename, result.mimeType, result.base64);
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={pending != null}>
        {pending === "csv" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {label} (CSV)
      </Button>
      <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")} disabled={pending != null}>
        {pending === "xlsx" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {label} (XLSX)
      </Button>
    </div>
  );
}
