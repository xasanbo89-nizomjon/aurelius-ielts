-- CreateEnum
CREATE TYPE "ImportedTestStatus" AS ENUM ('UPLOADED', 'PARSING', 'PARSED', 'FAILED', 'IMPORTED');

-- CreateTable
CREATE TABLE "imported_tests" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "type" "TestType" NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "status" "ImportedTestStatus" NOT NULL DEFAULT 'UPLOADED',
    "title" TEXT,
    "rawExtractedText" TEXT,
    "errorMessage" TEXT,
    "resultMockTestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imported_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imported_passages" (
    "id" TEXT NOT NULL,
    "importedTestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imported_passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imported_question_groups" (
    "id" TEXT NOT NULL,
    "importedPassageId" TEXT NOT NULL,
    "startNumber" INTEGER NOT NULL,
    "endNumber" INTEGER NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "instructions" TEXT NOT NULL,
    "questionsJson" JSONB NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imported_question_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imported_answers" (
    "id" TEXT NOT NULL,
    "importedTestId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "answerText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imported_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imported_tests_resultMockTestId_key" ON "imported_tests"("resultMockTestId");

-- CreateIndex
CREATE INDEX "imported_tests_teacherId_idx" ON "imported_tests"("teacherId");

-- CreateIndex
CREATE INDEX "imported_passages_importedTestId_idx" ON "imported_passages"("importedTestId");

-- CreateIndex
CREATE INDEX "imported_question_groups_importedPassageId_idx" ON "imported_question_groups"("importedPassageId");

-- CreateIndex
CREATE INDEX "imported_answers_importedTestId_idx" ON "imported_answers"("importedTestId");

-- CreateIndex
CREATE UNIQUE INDEX "imported_answers_importedTestId_questionNumber_key" ON "imported_answers"("importedTestId", "questionNumber");

-- AddForeignKey
ALTER TABLE "imported_tests" ADD CONSTRAINT "imported_tests_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_tests" ADD CONSTRAINT "imported_tests_resultMockTestId_fkey" FOREIGN KEY ("resultMockTestId") REFERENCES "mock_tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_passages" ADD CONSTRAINT "imported_passages_importedTestId_fkey" FOREIGN KEY ("importedTestId") REFERENCES "imported_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_question_groups" ADD CONSTRAINT "imported_question_groups_importedPassageId_fkey" FOREIGN KEY ("importedPassageId") REFERENCES "imported_passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_answers" ADD CONSTRAINT "imported_answers_importedTestId_fkey" FOREIGN KEY ("importedTestId") REFERENCES "imported_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
