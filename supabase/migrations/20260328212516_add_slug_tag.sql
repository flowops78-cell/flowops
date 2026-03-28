ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE public.clusters ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.clusters ADD COLUMN IF NOT EXISTS tag text;
