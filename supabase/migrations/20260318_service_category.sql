-- Add category column to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';
