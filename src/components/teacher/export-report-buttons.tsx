"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { exportReportAction, type ExportFormat, type ExportReportKind } from "@/actions/export.actions";
import { downloadBase64File } from "@/lib/download-file";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-wrap items-center gap-2">
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
