-- Adds the is_archived column the customers list + bulk-archive route already
-- references. The GET route was effectively dropping all rows because the
-- SELECT failed on a missing column, and even after the column-strip retry
-- the Active-tab filter referenced a column that didn't exist, so the UI
-- showed "0 total" for detailers with real customers.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS customers_detailer_archived_idx
  ON customers (detailer_id, is_archived);
