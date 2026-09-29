-- CreateEnum
CREATE TYPE "PassageAttachmentType" AS ENUM ('IMAGE', 'CHART', 'TABLE', 'DIAGRAM', 'MAP');

-- CreateEnum
CREATE TYPE "HighlightColor" AS ENUM ('YELLOW', 'BLUE', 'GREEN');

-- AlterTable
ALTER TABLE "highlights" ADD COLUMN     "color" "HighlightColor" NOT NULL DEFAULT 'YELLOW';

-- CreateTable
CREATE TABLE "passage_attachments" (
    "id" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "type" "PassageAttachmentType" NOT NULL,
    "imagePath" TEXT NOT NULL,
    "caption" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passage_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "passage_attachments" ADD CONSTRAINT "passage_attachments_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
