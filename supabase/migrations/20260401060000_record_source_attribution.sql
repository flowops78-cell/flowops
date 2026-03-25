-- -------------------------------------------------------------
-- 20260401060000_record_source_attribution.sql
-- Add channel_label to Records for direct source attribution
-- particularly for deferred/adjustment records.
-- -------------------------------------------------------------

BEGIN;

-- Add channel_label to records
ALTER TABLE public.records 
ADD COLUMN IF NOT EXISTS channel_label text;

-- Add target_entity_id for transfers (missing in canonical baseline but needed for transferUnits)
ALTER TABLE public.records
ADD COLUMN IF NOT EXISTS target_entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;

COMMIT;
