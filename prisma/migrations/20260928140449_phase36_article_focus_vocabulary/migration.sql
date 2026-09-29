-- AlterEnum
ALTER TYPE "ArticleDifficulty" ADD VALUE 'IELTS_ACADEMIC';

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "skillTags" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "article_highlights" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "color" "HighlightColor" NOT NULL DEFAULT 'YELLOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_notes" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_bookmarks" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_highlights_studentId_articleId_idx" ON "article_highlights"("studentId", "articleId");

-- CreateIndex
CREATE INDEX "article_notes_studentId_articleId_idx" ON "article_notes"("studentId", "articleId");

-- CreateIndex
CREATE INDEX "article_bookmarks_studentId_idx" ON "article_bookmarks"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "article_bookmarks_studentId_articleId_key" ON "article_bookmarks"("studentId", "articleId");

-- AddForeignKey
ALTER TABLE "article_highlights" ADD CONSTRAINT "article_highlights_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_highlights" ADD CONSTRAINT "article_highlights_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_notes" ADD CONSTRAINT "article_notes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_notes" ADD CONSTRAINT "article_notes_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_bookmarks" ADD CONSTRAINT "article_bookmarks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_bookmarks" ADD CONSTRAINT "article_bookmarks_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
