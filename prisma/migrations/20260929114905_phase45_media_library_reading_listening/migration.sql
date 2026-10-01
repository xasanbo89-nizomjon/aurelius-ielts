-- CreateEnum
CREATE TYPE "ListeningAccent" AS ENUM ('BRITISH', 'AMERICAN', 'AUSTRALIAN', 'CANADIAN');

-- CreateTable
CREATE TABLE "reading_library_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "level" "ArticleDifficulty" NOT NULL,
    "estimatedBand" DOUBLE PRECISION,
    "wordCount" INTEGER,
    "readingMinutes" INTEGER,
    "pdfPath" TEXT NOT NULL,
    "pdfFileName" TEXT NOT NULL,
    "pdfSize" INTEGER NOT NULL,
    "coverImagePath" TEXT,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_library_bookmarks" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_library_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listening_library_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" "ArticleDifficulty" NOT NULL,
    "accent" "ListeningAccent" NOT NULL,
    "audioPath" TEXT NOT NULL,
    "audioFileName" TEXT NOT NULL,
    "audioSize" INTEGER NOT NULL,
    "audioDurationSeconds" INTEGER,
    "transcript" TEXT,
    "coverImagePath" TEXT,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listening_library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listening_library_bookmarks" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listening_library_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reading_library_items_createdById_status_idx" ON "reading_library_items"("createdById", "status");

-- CreateIndex
CREATE INDEX "reading_library_bookmarks_studentId_idx" ON "reading_library_bookmarks"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "reading_library_bookmarks_studentId_itemId_key" ON "reading_library_bookmarks"("studentId", "itemId");

-- CreateIndex
CREATE INDEX "listening_library_items_createdById_status_idx" ON "listening_library_items"("createdById", "status");

-- CreateIndex
CREATE INDEX "listening_library_bookmarks_studentId_idx" ON "listening_library_bookmarks"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "listening_library_bookmarks_studentId_itemId_key" ON "listening_library_bookmarks"("studentId", "itemId");

-- AddForeignKey
ALTER TABLE "reading_library_items" ADD CONSTRAINT "reading_library_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_library_bookmarks" ADD CONSTRAINT "reading_library_bookmarks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_library_bookmarks" ADD CONSTRAINT "reading_library_bookmarks_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "reading_library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_library_items" ADD CONSTRAINT "listening_library_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_library_bookmarks" ADD CONSTRAINT "listening_library_bookmarks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_library_bookmarks" ADD CONSTRAINT "listening_library_bookmarks_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "listening_library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
