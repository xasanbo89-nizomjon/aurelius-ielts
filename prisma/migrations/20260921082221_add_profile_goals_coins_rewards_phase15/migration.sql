-- CreateEnum
CREATE TYPE "StudyActivityType" AS ENUM ('READING', 'LISTENING', 'VOCABULARY', 'WRITING', 'ARTICLE');

-- CreateEnum
CREATE TYPE "CoinTransactionType" AS ENUM ('STUDY_TIME', 'STREAK_BONUS', 'ACHIEVEMENT', 'REDEMPTION');

-- CreateEnum
CREATE TYPE "AchievementCode" AS ENUM ('FIRST_READING_TEST', 'FIRST_ARTICLE_COMPLETED', 'VOCAB_100_WORDS', 'WRITING_10_TASKS', 'STREAK_30_DAYS');

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "countryGoal" TEXT,
ADD COLUMN     "personalGoal" TEXT,
ADD COLUMN     "universityGoal" TEXT;

-- CreateTable
CREATE TABLE "study_activities" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "StudyActivityType" NOT NULL,
    "activityDate" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_wallets" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_transactions" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "CoinTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_streaks" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "code" "AchievementCode" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coinReward" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_unlocks" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_activities_studentId_activityDate_idx" ON "study_activities"("studentId", "activityDate");

-- CreateIndex
CREATE UNIQUE INDEX "study_activities_studentId_type_activityDate_key" ON "study_activities"("studentId", "type", "activityDate");

-- CreateIndex
CREATE UNIQUE INDEX "coin_wallets_studentId_key" ON "coin_wallets"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "coin_transactions_idempotencyKey_key" ON "coin_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "coin_transactions_studentId_createdAt_idx" ON "coin_transactions"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "study_streaks_studentId_key" ON "study_streaks"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_code_key" ON "achievements"("code");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_unlocks_studentId_achievementId_key" ON "achievement_unlocks"("studentId", "achievementId");

-- AddForeignKey
ALTER TABLE "study_activities" ADD CONSTRAINT "study_activities_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_wallets" ADD CONSTRAINT "coin_wallets_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_streaks" ADD CONSTRAINT "study_streaks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_unlocks" ADD CONSTRAINT "achievement_unlocks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_unlocks" ADD CONSTRAINT "achievement_unlocks_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
