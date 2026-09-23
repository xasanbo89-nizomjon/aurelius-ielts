-- CreateTable
CREATE TABLE "vocabulary_lookups" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "vocabularyWordId" TEXT NOT NULL,
    "articleId" TEXT,
    "difficultyColor" "VocabularyStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocabulary_lookups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vocabulary_lookups_studentId_createdAt_idx" ON "vocabulary_lookups"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "vocabulary_lookups_articleId_idx" ON "vocabulary_lookups"("articleId");

-- CreateIndex
CREATE INDEX "vocabulary_lookups_vocabularyWordId_idx" ON "vocabulary_lookups"("vocabularyWordId");

-- AddForeignKey
ALTER TABLE "vocabulary_lookups" ADD CONSTRAINT "vocabulary_lookups_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_lookups" ADD CONSTRAINT "vocabulary_lookups_vocabularyWordId_fkey" FOREIGN KEY ("vocabularyWordId") REFERENCES "vocabulary_words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_lookups" ADD CONSTRAINT "vocabulary_lookups_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
