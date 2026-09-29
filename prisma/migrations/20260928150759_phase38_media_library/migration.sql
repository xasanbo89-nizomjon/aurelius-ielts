-- CreateEnum
CREATE TYPE "MediaFileType" AS ENUM ('IMAGE', 'AUDIO', 'PDF', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "MediaUsageContext" AS ENUM ('PASSAGE_ATTACHMENT', 'ARTICLE_COVER', 'ARTICLE_ATTACHMENT');

-- CreateEnum
CREATE TYPE "ArticleAttachmentType" AS ENUM ('IMAGE', 'INFOGRAPHIC', 'ATTACHMENT');

-- AlterTable
ALTER TABLE "passage_attachments" ADD COLUMN     "mediaFileId" TEXT;

-- CreateTable
CREATE TABLE "media_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_files" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "type" "MediaFileType" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "thumbnailPath" TEXT,
    "folderId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_usages" (
    "id" TEXT NOT NULL,
    "mediaFileId" TEXT NOT NULL,
    "context" "MediaUsageContext" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_attachments" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "type" "ArticleAttachmentType" NOT NULL,
    "imagePath" TEXT NOT NULL,
    "caption" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "mediaFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_folders_ownerId_name_key" ON "media_folders"("ownerId", "name");

-- CreateIndex
CREATE INDEX "media_files_ownerId_type_idx" ON "media_files"("ownerId", "type");

-- CreateIndex
CREATE INDEX "media_files_ownerId_folderId_idx" ON "media_files"("ownerId", "folderId");

-- CreateIndex
CREATE INDEX "media_files_ownerId_createdAt_idx" ON "media_files"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "media_usages_mediaFileId_idx" ON "media_usages"("mediaFileId");

-- CreateIndex
CREATE INDEX "media_usages_context_referenceId_idx" ON "media_usages"("context", "referenceId");

-- AddForeignKey
ALTER TABLE "passage_attachments" ADD CONSTRAINT "passage_attachments_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "media_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_usages" ADD CONSTRAINT "media_usages_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "media_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_attachments" ADD CONSTRAINT "article_attachments_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_attachments" ADD CONSTRAINT "article_attachments_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
