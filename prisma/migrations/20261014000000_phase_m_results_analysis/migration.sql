-- Phase M - results analysis. Additive only: no existing column, row or constraint is changed or removed.
--   questions.evidence            where the answer is in the passage (set by a teacher; null for every question today)
--   ai_settings (2 columns)       teacher's opt-in and daily limit for AI evidence suggestions (null = off / default)
--   result_part_events            when the student moved to another part during an attempt (time per part)
--   evidence_suggestion_logs      what the daily limit of AI evidence suggestions counts
--   7 indexes on existing tables  the lookups the review page and the analytics queries make (none is needed at today's table sizes)

-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN     "dailyEvidenceSuggestionLimit" INTEGER,
ADD COLUMN     "evidenceSuggestionsEnabled" BOOLEAN;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "evidence" JSONB;

-- CreateTable
CREATE TABLE "result_part_events" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_part_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_suggestion_logs" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "mockTestId" TEXT,
    "questionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_suggestion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_part_events_resultId_enteredAt_idx" ON "result_part_events"("resultId", "enteredAt");

-- CreateIndex
CREATE INDEX "evidence_suggestion_logs_teacherId_createdAt_idx" ON "evidence_suggestion_logs"("teacherId", "createdAt");

-- CreateIndex
CREATE INDEX "highlights_resultId_idx" ON "highlights"("resultId");

-- CreateIndex
CREATE INDEX "notes_resultId_idx" ON "notes"("resultId");

-- CreateIndex
CREATE INDEX "questions_mockTestId_idx" ON "questions"("mockTestId");

-- CreateIndex
CREATE INDEX "results_studentId_completedAt_idx" ON "results"("studentId", "completedAt");

-- CreateIndex
CREATE INDEX "results_mockTestId_completedAt_idx" ON "results"("mockTestId", "completedAt");

-- CreateIndex
CREATE INDEX "student_profiles_teacherId_idx" ON "student_profiles"("teacherId");

-- AddForeignKey
ALTER TABLE "result_part_events" ADD CONSTRAINT "result_part_events_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_suggestion_logs" ADD CONSTRAINT "evidence_suggestion_logs_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
