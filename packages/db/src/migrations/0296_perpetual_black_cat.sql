-- Preserve the ledger precision in status-card update snapshots. Reapplying this type widening is safe.
ALTER TABLE "status_card_updates" ALTER COLUMN "cost_cents" SET DATA TYPE numeric(24, 7);