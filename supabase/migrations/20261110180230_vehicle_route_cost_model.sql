-- Vehicle load/fuel profile and route cost inputs.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS payload_capacity_kg numeric(12,2),
  ADD COLUMN IF NOT EXISTS fuel_efficiencies jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_payload_capacity_kg_check') THEN
    ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_payload_capacity_kg_check
      CHECK (payload_capacity_kg IS NULL OR payload_capacity_kg >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_fuel_efficiencies_object_check') THEN
    ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_fuel_efficiencies_object_check
      CHECK (jsonb_typeof(fuel_efficiencies) = 'object');
  END IF;
END $$;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS route_periodicity text NOT NULL DEFAULT 'esporadica',
  ADD COLUMN IF NOT EXISTS other_frequency_count integer,
  ADD COLUMN IF NOT EXISTS payload_weight_kg numeric(12,2),
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS fuel_type_used text,
  ADD COLUMN IF NOT EXISTS fuel_unit_price numeric(10,3),
  ADD COLUMN IF NOT EXISTS route_urban_highway_score integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS maintenance_cost numeric(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_route_periodicity_check') THEN
    ALTER TABLE public.routes ADD CONSTRAINT routes_route_periodicity_check
      CHECK (route_periodicity = ANY (ARRAY['diaria','semanal','quinzenal','mensal','esporadica','outros']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_other_frequency_count_check') THEN
    ALTER TABLE public.routes ADD CONSTRAINT routes_other_frequency_count_check
      CHECK ((route_periodicity = 'outros' AND other_frequency_count >= 1) OR (route_periodicity <> 'outros' AND other_frequency_count IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_payload_weight_kg_check') THEN
    ALTER TABLE public.routes ADD CONSTRAINT routes_payload_weight_kg_check
      CHECK (payload_weight_kg IS NULL OR payload_weight_kg >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_duration_minutes_check') THEN
    ALTER TABLE public.routes ADD CONSTRAINT routes_duration_minutes_check
      CHECK (duration_minutes IS NULL OR duration_minutes >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_fuel_type_used_check') THEN
    ALTER TABLE public.routes ADD CONSTRAINT routes_fuel_type_used_check
      CHECK (fuel_type_used IS NULL OR fuel_type_used = ANY (ARRAY['gasolina','diesel','etanol','gnv']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_fuel_unit_price_check') THEN
    ALTER TABLE public.routes ADD CONSTRAINT routes_fuel_unit_price_check
      CHECK (fuel_unit_price IS NULL OR fuel_unit_price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_urban_highway_score_check') THEN
    ALTER TABLE public.routes ADD CONSTRAINT routes_urban_highway_score_check
      CHECK (route_urban_highway_score BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_maintenance_cost_check') THEN
    ALTER TABLE public.routes ADD CONSTRAINT routes_maintenance_cost_check
      CHECK (maintenance_cost >= 0);
  END IF;
END $$;

ALTER TABLE public.finances DROP CONSTRAINT IF EXISTS finances_route_finance_category_check;
ALTER TABLE public.finances ADD CONSTRAINT finances_route_finance_category_check
  CHECK (route_finance_category IS NULL OR route_finance_category = ANY (ARRAY['receita','combustivel','motorista','outros','manutencao']));

CREATE OR REPLACE FUNCTION public.sync_completed_route_finances()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  route_row public.routes%ROWTYPE;
  route_day text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.finances
    WHERE tenant_id = OLD.tenant_id AND related_route_id = OLD.id AND route_finance_category IS NOT NULL;
    RETURN OLD;
  END IF;

  route_row := NEW;
  DELETE FROM public.finances
  WHERE tenant_id = route_row.tenant_id AND related_route_id = route_row.id AND route_finance_category IS NOT NULL;

  IF route_row.status = 'concluida' THEN
    route_day := to_char(COALESCE(route_row.end_time, route_row.start_time, now()) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
    INSERT INTO public.finances (tenant_id, type, description, amount, related_route_id, route_finance_category)
    SELECT route_row.tenant_id, entry.type, entry.description || route_day, entry.amount, route_row.id, entry.category
    FROM (VALUES
      ('entrada'::text, 'Receita da rota • ', route_row.price_charged, 'receita'::text),
      ('saida'::text, 'Combustível da rota • ', route_row.fuel_cost, 'combustivel'::text),
      ('saida'::text, 'Manutenção prevista da rota • ', route_row.maintenance_cost, 'manutencao'::text),
      ('saida'::text, 'Motorista da rota • ', route_row.driver_cost, 'motorista'::text),
      ('saida'::text, 'Outros custos da rota • ', route_row.other_costs, 'outros'::text)
    ) AS entry(type, description, amount, category)
    WHERE entry.amount IS NOT NULL AND entry.amount > 0;
  END IF;

  RETURN NEW;
END;
$function$;
