import { FallbackImage } from "@/components/ui/fallback-image";

export type ArticleAttachmentDisplay = { id: string; imagePath: string; caption: string | null };

/** Phase 38 — Part 5. Real inline images/infographics/attachments a teacher added, shown alongside the article text. Lazy-loaded by default via next/image. */
export function ArticleAttachments({ attachments }: { attachments: ArticleAttachmentDisplay[] }) {
  if (attachments.length === 0) return null;

  return (
    <div className="mb-6 space-y-4">
      {attachments.map((attachment) => (
        <figure key={attachment.id} className="border-border/70 bg-card overflow-hidden rounded-2xl border shadow-soft">
          <div className="bg-secondary/40 relative w-full">
            <FallbackImage
              src={attachment.imagePath}
              alt={attachment.caption ?? "Article image"}
              width={900}
              height={600}
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="h-auto w-full object-contain"
              unoptimized
            />
          </div>
          {attachment.caption && (
            <figcaption className="text-muted-foreground border-border/70 border-t px-3 py-2 text-xs">{attachment.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
