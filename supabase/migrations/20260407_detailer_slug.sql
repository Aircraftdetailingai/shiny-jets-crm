-- Add slug column for public-facing URLs
ALTER TABLE detailers ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Create index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_detailers_slug ON detailers(slug) WHERE slug IS NOT NULL;

-- Set Brett's slug
UPDATE detailers SET slug = 'vector-aviation' WHERE id = '9f2b9f6a-a104-4497-a5fc-735ab3a7c170';
