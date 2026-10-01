import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { listImportedTestsForTeacher } from "@/lib/pdf-test-import";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PdfTestImportUploadForm } from "@/components/teacher/pdf-test-import-upload-form";

export const metadata: Metadata = { title: "Import PDF Test" };

const STATUS_VARIANT = {
  UPLOADED: "outline",
  PARSING: "outline",
  PARSED: "accent",
  FAILED: "destructive",
  IMPORTED: "success",
} as const;

const STATUS_LABEL = {
  UPLOADED: "Uploaded",
  PARSING: "Analyzing…",
  PARSED: "Ready for review",
  FAILED: "Failed",
  IMPORTED: "Imported",
} as const;

export default async function TeacherPdfTestImportPage() {
  const { profile } = await requireTeacherProfile();
  const imports = await listImportedTestsForTeacher(profile.id);

  return (
    <>
      <PageHeader
        title="Import PDF Test"
        description="Upload a complete IELTS Reading or Listening PDF — passages, question groups and the answer key are detected automatically for you to review before anything is saved."
      />

      <PdfTestImportUploadForm />

      {imports.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-medium">Recent imports</h2>
          <div className="space-y-2">
            {imports.map((row) => (
              <Link key={row.id} href={`/teacher/tests/import/${row.id}`}>
                <Card className="transition-shadow hover:shadow-soft-lg">
                  <CardContent className="flex items-center justify-between gap-3 py-3.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.title || row.sourceFileName}</p>
                        <p className="text-muted-foreground truncate text-xs">{row.sourceFileName}</p>
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[row.status]} className="shrink-0">
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
