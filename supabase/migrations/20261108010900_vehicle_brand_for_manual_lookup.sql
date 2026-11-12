BEGIN;

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS brand text;

COMMIT;
