"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  createArticleAction,
  updateArticleAction,
  uploadArticleCoverImageAction,
} from "@/actions/articles.actions";
import { IMAGE_INPUT_ACCEPT, validateImageFile } from "@/lib/uploads/image-constraints";
import { computeContentStats } from "@/lib/content-stats";
import { ARTICLE_DIFFICULTY_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ExistingArticle = {
  id: string;
  title: string;
  description: string | null;
  content: string;
  category: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  coverImagePath: string | null;
};

export function ArticleForm({ existingArticle }: { existingArticle?: ExistingArticle }) {
  const router = useRouter();
  const [title, setTitle] = useState(existingArticle?.title ?? "");
  const [description, setDescription] = useState(existingArticle?.description ?? "");
  const [content, setContent] = useState(existingArticle?.content ?? "");
  const [category, setCategory] = useState(existingArticle?.category ?? "");
  const [difficulty, setDifficulty] = useState<ExistingArticle["difficulty"]>(existingArticle?.difficulty ?? "INTERMEDIATE");
  const [newCoverPath, setNewCoverPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const coverPreview = newCoverPath ?? existingArticle?.coverImagePath ?? null;
  const stats = computeContentStats(content);

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
    const result = await uploadArticleCoverImageAction(formData);
    setUploading(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setNewCoverPath(result.path);
    toast.success("Cover image uploaded.");
  }

  async function handleSubmit() {
    if (!title.trim()) return toast.error("Give the article a title.");
    if (!category.trim()) return toast.error("Add a category.");
    if (!content.trim()) return toast.error("Add the article content.");

    setSubmitting(true);
    const input = {
      title,
      description: description.trim() || undefined,
      content,
      category,
      difficulty,
      ...(newCoverPath && { coverImagePath: newCoverPath }),
    };
    const result = existingArticle
      ? await updateArticleAction(existingArticle.id, input)
      : await createArticleAction(input);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(existingArticle ? "Article saved." : "Article created as a draft.");
    if (!existingArticle && "articleId" in result && result.articleId) {
      router.push(`/teacher/articles/${result.articleId}`);
    } else {
      router.refresh();
    }
  }

  const busy = submitting || uploading;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="article-title">Title</Label>
        <Input
          id="article-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Why Cities Are Going Car-Free"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="article-description">Description (optional)</Label>
        <Textarea
          id="article-description"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A short summary shown in the article list…"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="article-category">Category</Label>
          <Input
            id="article-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Environment, Technology, Education…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="article-difficulty">Difficulty</Label>
          <Select value={difficulty} onValueChange={(value) => setDifficulty(value as ExistingArticle["difficulty"])}>
            <SelectTrigger id="article-difficulty">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ARTICLE_DIFFICULTY_LABELS) as ExistingArticle["difficulty"][]).map((level) => (
                <SelectItem key={level} value={level}>
                  {ARTICLE_DIFFICULTY_LABELS[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Cover image (optional)</Label>
        <input ref={fileInputRef} type="file" accept={IMAGE_INPUT_ACCEPT} className="hidden" onChange={handleFileChange} />
        <div className="flex items-center gap-3">
          {coverPreview ? (
            <div className="border-border/70 bg-secondary/30 relative size-16 shrink-0 overflow-hidden rounded-xl border">
              <Image src={coverPreview} alt="" fill sizes="64px" className="object-cover" unoptimized />
            </div>
          ) : (
            <div className="border-border/70 bg-secondary/30 text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-xl border">
              <ImageIcon className="size-6" strokeWidth={1.5} />
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {coverPreview ? "Replace image" : "Upload image"}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">Accepts .jpg, .png and .webp files, up to 5MB.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="article-content">Article content</Label>
        <Textarea
          id="article-content"
          rows={16}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="font-display"
          placeholder="Paste or write the full article. Paragraph breaks are preserved for students."
        />
        <p className="text-muted-foreground text-xs">
          {stats.wordCount.toLocaleString()} words · ~{stats.readingMinutes || 0} min read
        </p>
      </div>

      <Button onClick={handleSubmit} disabled={busy}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {existingArticle ? "Save changes" : "Create article"}
      </Button>
    </div>
  );
}
