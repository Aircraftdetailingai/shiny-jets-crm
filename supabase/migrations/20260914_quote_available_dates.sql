-- Offered date options on quotes + customer selection / alternate request
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS available_dates JSONB DEFAULT '[]'::jsonb;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_selected_date DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS alternate_date_requested DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS alternate_date_notes TEXT;

COMMENT ON COLUMN quotes.available_dates IS 'Owner-offered date options (YYYY-MM-DD strings) the customer can choose from';
COMMENT ON COLUMN quotes.customer_selected_date IS 'Date the customer selected from available_dates';
COMMENT ON COLUMN quotes.alternate_date_requested IS 'Alternate date the customer requested when none of the offered dates work';
COMMENT ON COLUMN quotes.alternate_date_notes IS 'Optional notes with an alternate date request';
