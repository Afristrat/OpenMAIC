-- Migration: Add updated_at column to scenes table for proper sync support
-- Fixes broken last-write-wins conflict resolution that was falling back to created_at

ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Backfill existing rows
UPDATE public.scenes SET updated_at = created_at WHERE updated_at IS NULL;

-- Reusable trigger function (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to scenes
DROP TRIGGER IF EXISTS scenes_updated_at ON public.scenes;
CREATE TRIGGER scenes_updated_at
  BEFORE UPDATE ON public.scenes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
