BEGIN;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS operation_type text,
  ADD COLUMN IF NOT EXISTS service_description text,
  ADD COLUMN IF NOT EXISTS starts_per_day integer,
  ADD COLUMN IF NOT EXISTS operating_days_per_week integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS average_daily_km integer,
  ADD COLUMN IF NOT EXISTS engine_version text;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS stop_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.maintenances
  ADD COLUMN IF NOT EXISTS component text NOT NULL DEFAULT 'outro',
  ADD COLUMN IF NOT EXISTS km_at_service integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_operation_type_check') THEN
    ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_operation_type_check
      CHECK (operation_type IS NULL OR operation_type IN ('entrega_porta_a_porta','urbano','rodoviario','obras_campo','passageiros','coleta','outro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_starts_per_day_check') THEN
    ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_starts_per_day_check
      CHECK (starts_per_day IS NULL OR starts_per_day BETWEEN 0 AND 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_operating_days_per_week_check') THEN
    ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_operating_days_per_week_check
      CHECK (operating_days_per_week BETWEEN 1 AND 7);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_average_daily_km_check') THEN
    ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_average_daily_km_check
      CHECK (average_daily_km IS NULL OR average_daily_km BETWEEN 0 AND 2000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_stop_count_check') THEN
    ALTER TABLE public.routes ADD CONSTRAINT routes_stop_count_check CHECK (stop_count BETWEEN 0 AND 1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenances_component_check') THEN
    ALTER TABLE public.maintenances ADD CONSTRAINT maintenances_component_check
      CHECK (component IN ('oleo_filtros','pneus','partida_eletrica','bateria','alternador','injecao_bicos','suspensao','freios','outro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenances_km_at_service_check') THEN
    ALTER TABLE public.maintenances ADD CONSTRAINT maintenances_km_at_service_check
      CHECK (km_at_service IS NULL OR km_at_service >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS routes_tenant_vehicle_status_start_idx
  ON public.routes (tenant_id, vehicle_id, status, start_time DESC);
CREATE INDEX IF NOT EXISTS maintenances_tenant_vehicle_component_date_idx
  ON public.maintenances (tenant_id, vehicle_id, component, date_service DESC);

COMMIT;
