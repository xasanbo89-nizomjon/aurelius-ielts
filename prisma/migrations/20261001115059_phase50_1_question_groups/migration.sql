-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "questionGroupId" TEXT;

-- CreateTable
CREATE TABLE "question_groups" (
    "id" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startQuestion" INTEGER NOT NULL,
    "endQuestion" INTEGER NOT NULL,
    "instructions" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_groups_passageId_idx" ON "question_groups"("passageId");

-- AddForeignKey
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_questionGroupId_fkey" FOREIGN KEY ("questionGroupId") REFERENCES "question_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
