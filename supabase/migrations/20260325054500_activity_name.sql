-- Add name column to activities table
-- Max length 60 characters for UI safety
ALTER TABLE activities 
ADD COLUMN name VARCHAR(60) DEFAULT NULL;

-- Backfill: No action needed for existing as NULL is acceptable fallback.
-- Fallback logic will be handled in the application layer.

-- Add a comment for clarity
COMMENT ON COLUMN activities.name IS 'Human-friendly label for the activity, optional.';
