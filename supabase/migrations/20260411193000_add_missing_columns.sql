-- Add columns that exist in canonical schema but are missing from deployed DB

ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS source_record_id uuid REFERENCES public.records(id);

ALTER TABLE public.organization_memberships
  ADD COLUMN IF NOT EXISTS account_email text;

NOTIFY pgrst, 'reload schema';
