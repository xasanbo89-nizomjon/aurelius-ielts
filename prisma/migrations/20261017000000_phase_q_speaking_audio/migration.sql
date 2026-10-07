-- Phase Q (B): Speaking practice with a real recording and an AI assessment. ADDITIVE ONLY: one new enum, four new tables (practices, the AI usage log, teacher comments,
-- platform settings) with their indexes and foreign keys to the existing student_profiles / teacher_profiles. No existing table or column is touched.

-- CreateEnum
CREATE TYPE "SpeakingAudioStatus" AS ENUM ('AWAITING_UPLOAD', 'PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "speaking_audio_practices" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "part" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "topicId" TEXT,
    "questionId" TEXT,
    "question" TEXT NOT NULL,
    "cueCardPoints" JSONB,
    "notes" TEXT,
    "feedbackLanguage" TEXT NOT NULL DEFAULT 'en',
    "status" "SpeakingAudioStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "audioPath" TEXT,
    "audioBytes" INTEGER,
    "audioSeconds" DOUBLE PRECISION,
    "transcript" TEXT,
    "fluencyBand" DOUBLE PRECISION,
    "lexicalBand" DOUBLE PRECISION,
    "grammarBand" DOUBLE PRECISION,
    "pronunciationBand" DOUBLE PRECISION,
    "overallBand" DOUBLE PRECISION,
    "pronunciationEstimated" BOOLEAN NOT NULL DEFAULT false,
    "assessment" JSONB,
    "transcribeModel" TEXT,
    "assessModel" TEXT,
    "usedAudio" BOOLEAN,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "speaking_audio_practices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speaking_audio_runs" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "audioInputTokens" INTEGER NOT NULL DEFAULT 0,
    "audioSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speaking_audio_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speaking_audio_comments" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speaking_audio_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "speaking_audio_practices_studentId_createdAt_idx" ON "speaking_audio_practices"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "speaking_audio_practices_studentId_submittedAt_idx" ON "speaking_audio_practices"("studentId", "submittedAt");

-- CreateIndex
CREATE INDEX "speaking_audio_practices_status_updatedAt_idx" ON "speaking_audio_practices"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "speaking_audio_runs_practiceId_idx" ON "speaking_audio_runs"("practiceId");

-- CreateIndex
CREATE INDEX "speaking_audio_runs_createdAt_idx" ON "speaking_audio_runs"("createdAt");

-- CreateIndex
CREATE INDEX "speaking_audio_comments_practiceId_createdAt_idx" ON "speaking_audio_comments"("practiceId", "createdAt");

-- AddForeignKey
ALTER TABLE "speaking_audio_practices" ADD CONSTRAINT "speaking_audio_practices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaking_audio_runs" ADD CONSTRAINT "speaking_audio_runs_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "speaking_audio_practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaking_audio_comments" ADD CONSTRAINT "speaking_audio_comments_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "speaking_audio_practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaking_audio_comments" ADD CONSTRAINT "speaking_audio_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

