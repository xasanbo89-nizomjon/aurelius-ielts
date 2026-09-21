-- CreateEnum
CREATE TYPE "VocabularyAiAction" AS ENUM ('WORD_INTELLIGENCE', 'EXPLAIN_WORD');

-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN     "dailyVocabularyAiLimit" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "vocabulary_words" ADD COLUMN     "aiGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "ieltsDifficulty" "ArticleDifficulty",
ADD COLUMN     "ieltsExamples" JSONB,
ADD COLUMN     "ipaPronunciation" TEXT,
ADD COLUMN     "opposites" JSONB,
ADD COLUMN     "relatedWords" JSONB,
ADD COLUMN     "simpleExamples" JSONB,
ADD COLUMN     "stressPattern" TEXT,
ADD COLUMN     "synonyms" JSONB,
ADD COLUMN     "wordFamily" JSONB;

-- CreateTable
CREATE TABLE "ai_word_explanations" (
    "id" TEXT NOT NULL,
    "vocabularyWordId" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "usage" TEXT NOT NULL,
    "commonMistakes" TEXT NOT NULL,
    "whenToUse" TEXT NOT NULL,
    "whenNotToUse" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_word_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_ai_action_logs" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "vocabularyWordId" TEXT,
    "action" "VocabularyAiAction" NOT NULL,
    "servedFromCache" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocabulary_ai_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_word_explanations_vocabularyWordId_key" ON "ai_word_explanations"("vocabularyWordId");

-- CreateIndex
CREATE INDEX "vocabulary_ai_action_logs_studentId_createdAt_idx" ON "vocabulary_ai_action_logs"("studentId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_word_explanations" ADD CONSTRAINT "ai_word_explanations_vocabularyWordId_fkey" FOREIGN KEY ("vocabularyWordId") REFERENCES "vocabulary_words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_ai_action_logs" ADD CONSTRAINT "vocabulary_ai_action_logs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_ai_action_logs" ADD CONSTRAINT "vocabulary_ai_action_logs_vocabularyWordId_fkey" FOREIGN KEY ("vocabularyWordId") REFERENCES "vocabulary_words"("id") ON DELETE SET NULL ON UPDATE CASCADE;
