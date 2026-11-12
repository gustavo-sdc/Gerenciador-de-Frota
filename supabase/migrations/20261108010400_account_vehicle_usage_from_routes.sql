BEGIN;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS start_cycles_total bigint NOT NULL DEFAULT 0
    CHECK (start_cycles_total >= 0);
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS usage_accounted boolean NOT NULL DEFAULT false;
ALTER TABLE public.maintenances
  ADD COLUMN IF NOT EXISTS start_cycles_at_service bigint;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenances_start_cycles_check') THEN
    ALTER TABLE public.maintenances ADD CONSTRAINT maintenances_start_cycles_check
      CHECK (start_cycles_at_service IS NULL OR start_cycles_at_service >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.account_completed_route_usage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  previous_accounted boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    previous_accounted := OLD.usage_accounted;
  END IF;

  IF NEW.status = 'concluida' AND NOT previous_accounted THEN
    UPDATE public.vehicles
      SET km_atual = km_atual + NEW.km_total,
          start_cycles_total = start_cycles_total + NEW.stop_count
      WHERE id = NEW.vehicle_id AND tenant_id = NEW.tenant_id;
    NEW.usage_accounted := true;
  ELSIF NEW.status = 'concluida' AND previous_accounted
    AND TG_OP = 'UPDATE' AND OLD.status = 'concluida'
    AND (NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
      OR NEW.km_total IS DISTINCT FROM OLD.km_total
      OR NEW.stop_count IS DISTINCT FROM OLD.stop_count) THEN
    IF NEW.vehicle_id IS NOT DISTINCT FROM OLD.vehicle_id THEN
      UPDATE public.vehicles
        SET km_atual = GREATEST(km_atual + NEW.km_total - OLD.km_total, km_aquisicao),
            start_cycles_total = GREATEST(start_cycles_total + NEW.stop_count - OLD.stop_count, 0)
        WHERE id = NEW.vehicle_id AND tenant_id = NEW.tenant_id;
    ELSE
      IF NEW.vehicle_id IS NOT NULL THEN
        UPDATE public.vehicles
          SET km_atual = km_atual + NEW.km_total,
              start_cycles_total = start_cycles_total + NEW.stop_count
          WHERE id = NEW.vehicle_id AND tenant_id = NEW.tenant_id;
      END IF;
      IF OLD.vehicle_id IS NOT NULL THEN
      UPDATE public.vehicles
        SET km_atual = GREATEST(km_atual - OLD.km_total, km_aquisicao),
            start_cycles_total = GREATEST(start_cycles_total - OLD.stop_count, 0)
        WHERE id = OLD.vehicle_id AND tenant_id = OLD.tenant_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS routes_account_completed_usage ON public.routes;
CREATE TRIGGER routes_account_completed_usage
  BEFORE INSERT OR UPDATE OF status, km_total, stop_count, vehicle_id
  ON public.routes
  FOR EACH ROW
  EXECUTE FUNCTION public.account_completed_route_usage();

COMMIT;
