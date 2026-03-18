-- Booking mode settings on detailers table
ALTER TABLE detailers ADD COLUMN IF NOT EXISTS booking_mode TEXT DEFAULT 'pay_to_book';
ALTER TABLE detailers ADD COLUMN IF NOT EXISTS deposit_percentage INTEGER DEFAULT 25;

-- Quote payment tracking
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS booking_mode TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_percentage INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS balance_due NUMERIC;

-- Invoice deposit tracking
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS balance_due NUMERIC;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS booking_mode TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS manual_payment_note TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
