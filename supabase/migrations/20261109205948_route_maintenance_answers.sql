ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS maintenance_answers jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.routes'::regclass
      AND conname = 'routes_maintenance_answers_object_check'
  ) THEN
    ALTER TABLE public.routes
      ADD CONSTRAINT routes_maintenance_answers_object_check
      CHECK (jsonb_typeof(maintenance_answers) = 'object');
  END IF;
END $$;
