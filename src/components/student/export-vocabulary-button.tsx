"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { exportVocabularyAction } from "@/actions/vocabulary.actions";
import { downloadBase64File } from "@/lib/download-file";
import { Button } from "@/components/ui/button";

export function ExportVocabularyButton() {
  const [pending, setPending] = useState(false);

  async function handleExport() {
    setPending(true);
    const result = await exportVocabularyAction();
    setPending(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    downloadBase64File(result.filename, result.mimeType, result.base64);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      Export
    </Button>
  );
}
