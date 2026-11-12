-- Ajusta a unicidade de placas ao modelo SaaS: placa única dentro da empresa.
-- Remove FKs simples duplicadas; as FKs compostas tenant + id permanecem.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.vehicles
    GROUP BY tenant_id, plate HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem placas repetidas dentro da mesma empresa; corrija antes da migration.';
  END IF;
END $$;

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_plate_key;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_tenant_plate_key UNIQUE (tenant_id, plate);

ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_client_id_fkey;
ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_driver_id_fkey;
ALTER TABLE public.route_photos DROP CONSTRAINT IF EXISTS route_photos_route_id_fkey;

CREATE INDEX IF NOT EXISTS route_photos_tenant_route_idx
  ON public.route_photos (tenant_id, route_id);

COMMIT;
