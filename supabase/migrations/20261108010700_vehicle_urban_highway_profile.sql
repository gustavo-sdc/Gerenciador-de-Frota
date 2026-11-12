BEGIN;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS urban_highway_score integer NOT NULL DEFAULT 3;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_urban_highway_score_check') THEN
    ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_urban_highway_score_check
      CHECK (urban_highway_score BETWEEN 1 AND 5);
  END IF;
END $$;

COMMIT;
