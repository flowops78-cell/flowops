-- Normalize legacy activity_mode and restrict to `value` (high_intensity removed from product).

UPDATE public.activities
SET activity_mode = 'value'
WHERE activity_mode IS NULL OR activity_mode <> 'value';

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_activity_mode_check;

ALTER TABLE public.activities
  ADD CONSTRAINT activities_activity_mode_check CHECK (activity_mode IN ('value'));

ALTER TABLE public.activities ALTER COLUMN activity_mode SET DEFAULT 'value';

INSERT INTO public._flow_ops_schema_patch_runs (label)
VALUES ('20260329100000_activity_mode_value_only');

NOTIFY pgrst, 'reload schema';
