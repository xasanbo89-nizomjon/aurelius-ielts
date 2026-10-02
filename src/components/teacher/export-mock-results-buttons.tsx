"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { exportMockResultsAction, type ExportFormat } from "@/actions/mock-access-codes.actions";
import { downloadBase64File } from "@/lib/download-file";
import { Button } from "@/components/ui/button";

export function ExportMockResultsButtons({ search }: { search?: string }) {
  const [pending, setPending] = useState<ExportFormat | null>(null);

  async function handleExport(format: ExportFormat) {
    setPending(format);
    const result = await exportMockResultsAction(format, search);
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
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")} disabled={pending != null}>
        {pending === "xlsx" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        XLSX
      </Button>
    </div>
  );
}
