-- Add theme_colors column to store extracted brand colors from logo and website
ALTER TABLE detailers ADD COLUMN IF NOT EXISTS theme_colors jsonb DEFAULT '[]'::jsonb;
