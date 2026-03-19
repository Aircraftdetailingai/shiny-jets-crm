-- Add quantity and min_quantity columns to equipment table
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS min_quantity INTEGER;
