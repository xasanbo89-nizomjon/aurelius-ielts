-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currentLoginStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginDate" TIMESTAMP(3),
ADD COLUMN     "longestLoginStreak" INTEGER NOT NULL DEFAULT 0;
