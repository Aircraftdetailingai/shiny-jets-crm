-- Barcode / QR support for inventory products. Scanned codes are matched
-- within the detailer's own inventory (no external barcode database lookup).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS barcode_type text; -- 'UPC_A', 'EAN_13', 'QR_CODE', 'CODE_128', etc.

CREATE INDEX IF NOT EXISTS idx_products_barcode
  ON products(detailer_id, barcode) WHERE barcode IS NOT NULL;
