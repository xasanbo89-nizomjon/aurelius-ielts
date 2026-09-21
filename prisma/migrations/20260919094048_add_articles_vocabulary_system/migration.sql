-- CreateEnum
CREATE TYPE "ArticleDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "VocabularyStatus" AS ENUM ('UNKNOWN', 'LEARNING', 'KNOWN');

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "coverImagePath" TEXT,
    "category" TEXT NOT NULL,
    "difficulty" "ArticleDifficulty" NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "wordCount" INTEGER NOT NULL,
    "readingMinutes" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_views" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_words" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "uzbekTranslation" TEXT,
    "englishDefinition" TEXT,
    "exampleSentence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabulary_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_vocabulary" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "vocabularyWordId" TEXT NOT NULL,
    "articleId" TEXT,
    "status" "VocabularyStatus" NOT NULL DEFAULT 'UNKNOWN',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_vocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_progress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "lastPosition" INTEGER NOT NULL DEFAULT 0,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "articles_createdById_status_idx" ON "articles"("createdById", "status");

-- CreateIndex
CREATE INDEX "article_views_articleId_idx" ON "article_views"("articleId");

-- CreateIndex
CREATE INDEX "article_views_studentId_idx" ON "article_views"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_words_word_key" ON "vocabulary_words"("word");

-- CreateIndex
CREATE INDEX "student_vocabulary_studentId_status_idx" ON "student_vocabulary"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_vocabulary_studentId_vocabularyWordId_key" ON "student_vocabulary"("studentId", "vocabularyWordId");

-- CreateIndex
CREATE UNIQUE INDEX "reading_progress_studentId_articleId_key" ON "reading_progress"("studentId", "articleId");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_views" ADD CONSTRAINT "article_views_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_views" ADD CONSTRAINT "article_views_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_vocabulary" ADD CONSTRAINT "student_vocabulary_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_vocabulary" ADD CONSTRAINT "student_vocabulary_vocabularyWordId_fkey" FOREIGN KEY ("vocabularyWordId") REFERENCES "vocabulary_words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_vocabulary" ADD CONSTRAINT "student_vocabulary_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
