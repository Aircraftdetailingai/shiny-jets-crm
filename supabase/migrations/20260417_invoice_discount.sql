ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'percent';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_reason text;
