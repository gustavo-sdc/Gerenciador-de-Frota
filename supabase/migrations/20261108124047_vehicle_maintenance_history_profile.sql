ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS maintenance_history jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(maintenance_history) = 'object');
