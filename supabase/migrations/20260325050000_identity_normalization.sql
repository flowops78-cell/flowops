-- -------------------------------------------------------------
-- 20260325050000_identity_normalization.sql
-- Add human-readable tags and slugs to clusters and organizations.
-- -------------------------------------------------------------

BEGIN;

-- 1. Add columns to public.clusters
ALTER TABLE public.clusters ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE public.clusters ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- 2. Add columns to public.organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- 3. Function to generate slug
CREATE OR REPLACE FUNCTION public.slugify(text)
RETURNS text AS $$
  SELECT lower(regexp_replace(regexp_replace($1, '[^a-zA-Z0-9\s]', '', 'g'), '\s+', '-', 'g'));
$$ LANGUAGE SQL IMMUTABLE;

-- 4. Backfill data
UPDATE public.clusters 
SET 
  tag = substring(name from 1 for 4) || '_' || substring(id::text from 1 for 4),
  slug = public.slugify(name) || '-' || substring(id::text from 1 for 4)
WHERE tag IS NULL OR slug IS NULL;

UPDATE public.organizations 
SET 
  tag = substring(name from 1 for 4) || '_' || substring(id::text from 1 for 4),
  slug = public.slugify(name) || '-' || substring(id::text from 1 for 4)
WHERE tag IS NULL OR slug IS NULL;

-- 5. Add constraints (optional, but good for slugs)
ALTER TABLE public.clusters ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.organizations ALTER COLUMN slug SET NOT NULL;

COMMIT;
