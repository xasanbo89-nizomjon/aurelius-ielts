"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { FolderOpen, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { addArticleAttachmentAction, deleteArticleAttachmentAction } from "@/actions/articles.actions";
import { uploadMediaFileAction } from "@/actions/media-library.actions";
import { IMAGE_INPUT_ACCEPT, validateImageFile } from "@/lib/uploads/image-constraints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MediaFilePickerDialog } from "@/components/teacher/media-file-picker-dialog";

export type ArticleAttachmentTypeValue = "IMAGE" | "INFOGRAPHIC" | "ATTACHMENT";
export type ExistingArticleAttachment = { id: string; type: ArticleAttachmentTypeValue; imagePath: string; caption: string | null };

const TYPE_LABEL: Record<ArticleAttachmentTypeValue, string> = {
  IMAGE: "Inline Image",
  INFOGRAPHIC: "Infographic",
  ATTACHMENT: "Attachment",
};

/** Phase 38 — Part 5's optional inline images/infographics/attachments for an article. Shown only once the article has been saved. */
export function ArticleAttachmentsManager({ articleId, attachments }: { articleId: string; attachments: ExistingArticleAttachment[] }) {
  const [type, setType] = useState<ArticleAttachmentTypeValue>("IMAGE");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePick(file: { id: string; path: string }) {
    const result = await addArticleAttachmentAction(articleId, {
      type,
      imagePath: file.path,
      caption: caption.trim() || undefined,
      mediaFileId: file.id,
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setCaption("");
    toast.success("Attachment added from Media Library.");
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", "image");
    const uploadResult = await uploadMediaFileAction(formData);
    if (!uploadResult.success) {
      setUploading(false);
      toast.error(uploadResult.error);
      return;
    }

    const result = await addArticleAttachmentAction(articleId, {
      type,
      imagePath: uploadResult.file.path,
      caption: caption.trim() || undefined,
      mediaFileId: uploadResult.file.id,
    });
    setUploading(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setCaption("");
    toast.success("Attachment added.");
  }

  async function handleDelete(attachmentId: string) {
    setDeletingId(attachmentId);
    const result = await deleteArticleAttachmentAction(attachmentId, articleId);
    setDeletingId(null);
    if (!result.success) toast.error(result.error);
  }

  return (
    <div className="space-y-3">
      <Label>Inline images, infographics & attachments (optional)</Label>

      {attachments.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="border-border/70 bg-secondary/20 space-y-1.5 rounded-xl border p-2">
              <div className="bg-secondary relative aspect-video overflow-hidden rounded-lg">
                <Image src={attachment.imagePath} alt={attachment.caption ?? TYPE_LABEL[attachment.type]} fill sizes="200px" className="object-cover" unoptimized />
              </div>
              <div className="flex items-center justify-between gap-1">
                <Badge variant="outline" className="text-[10px]">
                  {TYPE_LABEL[attachment.type]}
                </Badge>
                <button
                  type="button"
                  onClick={() => handleDelete(attachment.id)}
                  disabled={deletingId === attachment.id}
                  aria-label="Remove attachment"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  {deletingId === attachment.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </button>
              </div>
              {attachment.caption && <p className="text-muted-foreground line-clamp-1 text-[11px]">{attachment.caption}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="border-border/70 flex flex-col gap-2 rounded-xl border border-dashed p-3 sm:flex-row sm:items-end">
        <input ref={fileInputRef} type="file" accept={IMAGE_INPUT_ACCEPT} className="hidden" onChange={handleFileChange} />
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="article-attachment-caption" className="text-xs">
            Caption (optional)
          </Label>
          <Input
            id="article-attachment-caption"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Figure 1"
            className="h-9 text-sm"
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-36">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(value) => setType(value as ArticleAttachmentTypeValue)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPE_LABEL) as ArticleAttachmentTypeValue[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {TYPE_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            Upload
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <FolderOpen className="size-3.5" /> Library
          </Button>
        </div>
      </div>
      {attachments.length === 0 && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ImageIcon className="size-3.5" /> No attachments added yet.
        </p>
      )}

      <MediaFilePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={handlePick} />
    </div>
  );
}
