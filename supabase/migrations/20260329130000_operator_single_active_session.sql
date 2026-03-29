-- Enforce at most one active operator_activities row per (org_id, actor_user_id).
-- Complements auth single-session (profiles.current_session_id): work "clock-in" cannot overlap
-- within the same workspace for the same user.

-- 1) Remediate existing duplicates (keep the newest started_at per org + actor).
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, actor_user_id
      ORDER BY started_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM public.operator_activities
  WHERE is_active IS TRUE
)
UPDATE public.operator_activities oa
SET
  is_active = FALSE,
  ended_at = COALESCE(oa.ended_at, now()),
  duration_seconds = COALESCE(
    oa.duration_seconds,
    GREATEST(
      0,
      LEAST(
        2147483647,
        FLOOR(EXTRACT(EPOCH FROM (COALESCE(oa.ended_at, now()) - oa.started_at)))::integer
      )
    )
  )
FROM ranked r
WHERE oa.id = r.id
  AND r.rn > 1;

-- 2) Before a new active row is inserted (or a row is re-opened), end any other active session
-- for the same org + actor so clients do not rely on the UI alone.
CREATE OR REPLACE FUNCTION public.operator_activities_enforce_single_active()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_active IS TRUE THEN
    UPDATE public.operator_activities oa
    SET
      is_active = FALSE,
      ended_at = now(),
      duration_seconds = COALESCE(
        oa.duration_seconds,
        GREATEST(
          0,
          LEAST(2147483647, FLOOR(EXTRACT(EPOCH FROM (now() - oa.started_at)))::integer)
        )
      )
    WHERE oa.org_id = NEW.org_id
      AND oa.actor_user_id = NEW.actor_user_id
      AND oa.is_active IS TRUE;
  ELSIF TG_OP = 'UPDATE'
    AND NEW.is_active IS TRUE
    AND COALESCE(OLD.is_active, FALSE) IS FALSE
  THEN
    UPDATE public.operator_activities oa
    SET
      is_active = FALSE,
      ended_at = now(),
      duration_seconds = COALESCE(
        oa.duration_seconds,
        GREATEST(
          0,
          LEAST(2147483647, FLOOR(EXTRACT(EPOCH FROM (now() - oa.started_at)))::integer)
        )
      )
    WHERE oa.org_id = NEW.org_id
      AND oa.actor_user_id = NEW.actor_user_id
      AND oa.is_active IS TRUE
      AND oa.id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operator_activities_single_active ON public.operator_activities;
CREATE TRIGGER trg_operator_activities_single_active
  BEFORE INSERT OR UPDATE ON public.operator_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.operator_activities_enforce_single_active();

-- 3) Hard guarantee (trigger + concurrent inserts).
CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_activities_one_active_per_org_actor
  ON public.operator_activities (org_id, actor_user_id)
  WHERE (is_active IS TRUE);
