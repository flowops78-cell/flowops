-- -------------------------------------------------------------
-- 20260328000001_extend_canonical_schema.sql
-- Add UI-required positioning and lifecycle fields to Records
-- -------------------------------------------------------------

BEGIN;

-- Add positioning fields to records
ALTER TABLE public.records 
ADD COLUMN IF NOT EXISTS position_id integer,
ADD COLUMN IF NOT EXISTS sort_order integer,
ADD COLUMN IF NOT EXISTS left_at timestamptz;

-- Add operational fields to activities
ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS operational_weight numeric(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS channel_weight numeric(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS activity_mode text DEFAULT 'value' CHECK (activity_mode IN ('value', 'high_intensity'));

-- Add activity_id to operator_activities
ALTER TABLE public.operator_activities
ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.activities(id) ON DELETE CASCADE;

-- Add indices for performance
CREATE INDEX IF NOT EXISTS idx_records_activity_position ON public.records(activity_id, position_id);
CREATE INDEX IF NOT EXISTS idx_records_entity_left_at ON public.records(entity_id, left_at);

COMMIT;
