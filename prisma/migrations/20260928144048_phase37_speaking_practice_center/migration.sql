-- CreateEnum
CREATE TYPE "SpeakingPracticePart" AS ENUM ('PART_1', 'PART_2', 'PART_3');

-- CreateEnum
CREATE TYPE "SpeakingTopicStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SpeakingAttemptStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateTable
CREATE TABLE "speaking_topics" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "part" "SpeakingPracticePart" NOT NULL,
    "status" "SpeakingTopicStatus" NOT NULL DEFAULT 'DRAFT',
    "cueCardDescription" TEXT,
    "cueCardBulletPoints" JSONB,
    "cueCardFollowUp" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "speaking_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speaking_questions" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speaking_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speaking_attempts" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "questionId" TEXT,
    "part" "SpeakingPracticePart" NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SpeakingAttemptStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "speaking_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speaking_feedback" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "grammarBand" DOUBLE PRECISION NOT NULL,
    "vocabularyBand" DOUBLE PRECISION NOT NULL,
    "fluencyBand" DOUBLE PRECISION NOT NULL,
    "coherenceBand" DOUBLE PRECISION NOT NULL,
    "structureBand" DOUBLE PRECISION NOT NULL,
    "overallBand" DOUBLE PRECISION NOT NULL,
    "grammarFeedback" TEXT NOT NULL,
    "vocabularyFeedback" TEXT NOT NULL,
    "fluencyFeedback" TEXT NOT NULL,
    "coherenceFeedback" TEXT NOT NULL,
    "structureFeedback" TEXT NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speaking_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "speaking_topics_createdById_status_idx" ON "speaking_topics"("createdById", "status");

-- CreateIndex
CREATE INDEX "speaking_attempts_studentId_createdAt_idx" ON "speaking_attempts"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "speaking_attempts_topicId_idx" ON "speaking_attempts"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "speaking_feedback_attemptId_key" ON "speaking_feedback"("attemptId");

-- AddForeignKey
ALTER TABLE "speaking_topics" ADD CONSTRAINT "speaking_topics_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaking_questions" ADD CONSTRAINT "speaking_questions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "speaking_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "speaking_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "speaking_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaking_feedback" ADD CONSTRAINT "speaking_feedback_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "speaking_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
