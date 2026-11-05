-- Keep the author of each block for persistence across reload
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS author jsonb;
