-- Phase M2 - stored explanations ("Explain more" / "What's the trap?") for the review. Additive only: no existing column, row or constraint is changed or removed.
--   question_explanations         one row per question: the explanation text, its status (DRAFT / APPROVED) and the hash of what it was written for
--   explanation_generation_logs   one row per AI request that reached the model (what the teacher's daily limit counts; token usage for the Root Teacher)
--   ai_settings (2 columns)       the teacher's opt-in and daily limit for generating explanations with AI (null = off / default)

-- CreateEnum
CREATE TYPE "ExplanationStatus" AS ENUM ('DRAFT', 'APPROVED');

-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN     "dailyExplanationAiLimit" INTEGER,
ADD COLUMN     "explanationsEnabled" BOOLEAN;

-- CreateTable
CREATE TABLE "question_explanations" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "explainText" TEXT,
    "trapText" TEXT,
    "fixText" TEXT,
    "status" "ExplanationStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceHash" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "model" TEXT,
    "generatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "explanation_generation_logs" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "mockTestId" TEXT,
    "questionId" TEXT,
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explanation_generation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_explanations_questionId_key" ON "question_explanations"("questionId");

-- CreateIndex
CREATE INDEX "explanation_generation_logs_teacherId_createdAt_idx" ON "explanation_generation_logs"("teacherId", "createdAt");

-- AddForeignKey
ALTER TABLE "question_explanations" ADD CONSTRAINT "question_explanations_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explanation_generation_logs" ADD CONSTRAINT "explanation_generation_logs_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

