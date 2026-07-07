-- Configurable quote validity.
-- Detailer-level default (days) + optional per-quote override.
-- valid_until is written send-anchored (sent_at + resolvedDays), first-send-only.
-- No backfill: existing quotes keep their current valid_until.

ALTER TABLE detailers
  ADD COLUMN IF NOT EXISTS default_quote_validity_days int NOT NULL DEFAULT 30;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS quote_validity_days int;
