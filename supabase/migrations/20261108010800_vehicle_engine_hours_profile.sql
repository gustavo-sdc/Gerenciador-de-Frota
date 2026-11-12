BEGIN;

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS engine_hours_per_day numeric(4,1);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_engine_hours_per_day_check') THEN
    ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_engine_hours_per_day_check
      CHECK (engine_hours_per_day IS NULL OR engine_hours_per_day BETWEEN 0 AND 24);
  END IF;
END $$;

COMMIT;
