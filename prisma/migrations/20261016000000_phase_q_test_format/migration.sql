-- Phase Q (A4): the kind of paper a Reading / Listening test is. Additive and nullable only: null on every existing row, and null means FULL_IELTS (exactly 40 questions,
-- the IELTS band table). CUSTOM = any number of questions and parts, scored as raw score and percentage.

-- CreateEnum
CREATE TYPE "TestFormat" AS ENUM ('FULL_IELTS', 'CUSTOM');

-- AlterTable
ALTER TABLE "imported_tests" ADD COLUMN     "testFormat" "TestFormat";

-- AlterTable
ALTER TABLE "mock_tests" ADD COLUMN     "testFormat" "TestFormat";
