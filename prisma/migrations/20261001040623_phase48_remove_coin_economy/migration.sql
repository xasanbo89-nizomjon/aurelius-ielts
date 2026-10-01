-- Phase 48 — Premium System Cleanup: permanently removes the coin economy.
-- Confirmed by the user: this destroys 4 real CoinWallet rows and 17 real
-- CoinTransaction rows. Subscription.source keeps its historical
-- COIN_REDEMPTION enum value (unaffected — no FK from Subscription to these
-- tables), so past "got Premium via coin redemption" history stays readable.

-- DropForeignKey
ALTER TABLE "coin_wallets" DROP CONSTRAINT "coin_wallets_studentId_fkey";

-- DropForeignKey
ALTER TABLE "coin_transactions" DROP CONSTRAINT "coin_transactions_studentId_fkey";

-- DropTable
DROP TABLE "coin_wallets";

-- DropTable
DROP TABLE "coin_transactions";

-- DropEnum
DROP TYPE "CoinTransactionType";

-- AlterTable
ALTER TABLE "achievements" DROP COLUMN "coinReward";
