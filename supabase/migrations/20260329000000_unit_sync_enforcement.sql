-- -------------------------------------------------------------
-- 20260329000000_unit_sync_enforcement.sql
-- Enforce database-level unit balance synchronization
-- -------------------------------------------------------------

BEGIN;

-- 1. Extend records table with target_entity_id for transfers
ALTER TABLE public.records 
ADD COLUMN IF NOT EXISTS target_entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_records_target_entity_id ON public.records(target_entity_id);

-- 2. Trigger function for atomic balance synchronization
CREATE OR REPLACE FUNCTION public.sync_entity_balance_on_record_change()
RETURNS trigger AS $$
DECLARE
  v_delta numeric(12, 2);
  v_old_delta numeric(12, 2);
BEGIN
  -- Handle DELETE or OLD state in UPDATE
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.status = 'applied' THEN
    v_old_delta := CASE 
      WHEN OLD.direction = 'increase' THEN OLD.unit_amount
      WHEN OLD.direction = 'decrease' THEN -OLD.unit_amount
      WHEN OLD.direction = 'transfer' THEN -OLD.unit_amount
      ELSE 0
    END;

    -- Reverse old state
    IF OLD.entity_id IS NOT NULL THEN
      UPDATE public.entities 
      SET total_units = total_units - v_old_delta 
      WHERE id = OLD.entity_id;
    END IF;

    -- Special handling for transfer target reversal
    IF OLD.direction = 'transfer' AND OLD.target_entity_id IS NOT NULL THEN
      UPDATE public.entities 
      SET total_units = total_units - OLD.unit_amount 
      WHERE id = OLD.target_entity_id;
    END IF;
  END IF;

  -- Handle INSERT or NEW state in UPDATE
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.status = 'applied' THEN
    v_delta := CASE 
      WHEN NEW.direction = 'increase' THEN NEW.unit_amount
      WHEN NEW.direction = 'decrease' THEN -NEW.unit_amount
      WHEN NEW.direction = 'transfer' THEN -NEW.unit_amount
      ELSE 0
    END;

    -- Apply new state
    IF NEW.entity_id IS NOT NULL THEN
      UPDATE public.entities 
      SET total_units = total_units + v_delta 
      WHERE id = NEW.entity_id;
    END IF;

    -- Special handling for transfer target
    IF NEW.direction = 'transfer' AND NEW.target_entity_id IS NOT NULL THEN
      UPDATE public.entities 
      SET total_units = total_units + NEW.unit_amount 
      WHERE id = NEW.target_entity_id;
    END IF;
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach trigger
DROP TRIGGER IF EXISTS tr_sync_entity_balance ON public.records;
CREATE TRIGGER tr_sync_entity_balance
AFTER INSERT OR UPDATE OR DELETE ON public.records
FOR EACH ROW EXECUTE FUNCTION public.sync_entity_balance_on_record_change();

-- 4. Verification Test Block (Optional/Temporary)
-- This ensures the logic works in a clean environment.
/*
DO $$
DECLARE
  v_org_id uuid;
  v_activity_id uuid;
  v_entity_a uuid;
  v_entity_b uuid;
BEGIN
  -- 1. Setup
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  SELECT id INTO v_activity_id FROM public.activities WHERE org_id = v_org_id LIMIT 1;
  
  INSERT INTO public.entities (org_id, name, total_units) 
  VALUES (v_org_id, 'Test Entity A', 0), (v_org_id, 'Test Entity B', 0)
  RETURNING id INTO v_entity_a;
  
  SELECT id INTO v_entity_b FROM public.entities WHERE name = 'Test Entity B' AND org_id = v_org_id;

  -- 2. Test Increase
  INSERT INTO public.records (org_id, activity_id, entity_id, direction, status, unit_amount)
  VALUES (v_org_id, v_activity_id, v_entity_a, 'increase', 'applied', 100);
  
  IF (SELECT total_units FROM public.entities WHERE id = v_entity_a) <> 100 THEN
    RAISE EXCEPTION 'Increase test failed';
  END IF;

  -- 3. Test Transfer
  INSERT INTO public.records (org_id, activity_id, entity_id, target_entity_id, direction, status, unit_amount)
  VALUES (v_org_id, v_activity_id, v_entity_a, v_entity_b, 'transfer', 'applied', 40);
  
  IF (SELECT total_units FROM public.entities WHERE id = v_entity_a) <> 60 THEN
    RAISE EXCEPTION 'Transfer source test failed';
  END IF;
  IF (SELECT total_units FROM public.entities WHERE id = v_entity_b) <> 40 THEN
    RAISE EXCEPTION 'Transfer target test failed';
  END IF;

  -- 4. Test Void (Update status)
  UPDATE public.records SET status = 'voided' WHERE entity_id = v_entity_a AND direction = 'increase';
  
  IF (SELECT total_units FROM public.entities WHERE id = v_entity_a) <> -40 THEN
    -- 100 (original) was removed, so 0 - 40 = -40
    RAISE EXCEPTION 'Void test failed. Balance: %', (SELECT total_units FROM public.entities WHERE id = v_entity_a);
  END IF;

  RAISE NOTICE 'Unit synchronization verification PASSED';
  
  -- Rollback test data (not needed in real migration if using ROLLBACK)
END;
$$;
*/

COMMIT;
