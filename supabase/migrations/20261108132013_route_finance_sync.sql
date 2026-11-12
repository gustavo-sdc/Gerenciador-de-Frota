-- Keep completed-route KM accounting reversible and mirror route income/costs in the ledger.
ALTER TABLE public.finances
  ADD COLUMN IF NOT EXISTS route_finance_category text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.finances'::regclass
      AND conname = 'finances_route_finance_category_check'
  ) THEN
    ALTER TABLE public.finances
      ADD CONSTRAINT finances_route_finance_category_check
      CHECK (route_finance_category IS NULL OR route_finance_category IN ('receita', 'combustivel', 'motorista', 'outros'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.finances'::regclass
      AND conname = 'finances_route_finance_requires_route_check'
  ) THEN
    ALTER TABLE public.finances
      ADD CONSTRAINT finances_route_finance_requires_route_check
      CHECK (route_finance_category IS NULL OR related_route_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.routes'::regclass
      AND conname = 'routes_completed_require_details_check'
  ) THEN
    ALTER TABLE public.routes
      ADD CONSTRAINT routes_completed_require_details_check
      CHECK (status <> 'concluida' OR (vehicle_id IS NOT NULL AND driver_id IS NOT NULL AND price_charged IS NOT NULL));
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS finances_route_category_unique
  ON public.finances (tenant_id, related_route_id, route_finance_category)
  WHERE route_finance_category IS NOT NULL;

CREATE OR REPLACE FUNCTION public.account_completed_route_usage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  old_contribution boolean := false;
  new_contribution boolean := false;
  usage_changed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.usage_accounted AND OLD.status = 'concluida' AND OLD.vehicle_id IS NOT NULL THEN
      UPDATE public.vehicles
      SET km_atual = GREATEST(km_atual - OLD.km_total, km_aquisicao),
          start_cycles_total = GREATEST(start_cycles_total - OLD.stop_count, 0)
      WHERE id = OLD.vehicle_id AND tenant_id = OLD.tenant_id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_contribution := OLD.usage_accounted AND OLD.status = 'concluida' AND OLD.vehicle_id IS NOT NULL;
    usage_changed := NEW.status IS DISTINCT FROM OLD.status
      OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
      OR NEW.km_total IS DISTINCT FROM OLD.km_total
      OR NEW.stop_count IS DISTINCT FROM OLD.stop_count;
  ELSE
    usage_changed := true;
  END IF;

  new_contribution := NEW.status = 'concluida' AND NEW.vehicle_id IS NOT NULL;
  IF TG_OP = 'UPDATE' AND NOT usage_changed THEN
    NEW.usage_accounted := old_contribution;
    RETURN NEW;
  END IF;

  IF old_contribution THEN
    UPDATE public.vehicles
    SET km_atual = GREATEST(km_atual - OLD.km_total, km_aquisicao),
        start_cycles_total = GREATEST(start_cycles_total - OLD.stop_count, 0)
    WHERE id = OLD.vehicle_id AND tenant_id = OLD.tenant_id;
  END IF;

  IF new_contribution THEN
    UPDATE public.vehicles
    SET km_atual = km_atual + NEW.km_total,
        start_cycles_total = start_cycles_total + NEW.stop_count
    WHERE id = NEW.vehicle_id AND tenant_id = NEW.tenant_id;
  END IF;

  NEW.usage_accounted := new_contribution;
  RETURN NEW;
END;
$function$;

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
    WHERE tenant_id = OLD.tenant_id
      AND related_route_id = OLD.id
      AND route_finance_category IS NOT NULL;
    RETURN OLD;
  END IF;

  route_row := NEW;
  DELETE FROM public.finances
  WHERE tenant_id = route_row.tenant_id
    AND related_route_id = route_row.id
    AND route_finance_category IS NOT NULL;

  IF route_row.status = 'concluida' THEN
    route_day := to_char(COALESCE(route_row.end_time, route_row.start_time, now()) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
    INSERT INTO public.finances (tenant_id, type, description, amount, related_route_id, route_finance_category)
    SELECT route_row.tenant_id, entry.type, entry.description || route_day, entry.amount, route_row.id, entry.category
    FROM (VALUES
      ('entrada'::text, 'Receita da rota • ', route_row.price_charged, 'receita'::text),
      ('saida'::text, 'Combustível da rota • ', route_row.fuel_cost, 'combustivel'::text),
      ('saida'::text, 'Motorista da rota • ', route_row.driver_cost, 'motorista'::text),
      ('saida'::text, 'Outros custos da rota • ', route_row.other_costs, 'outros'::text)
    ) AS entry(type, description, amount, category)
    WHERE entry.amount IS NOT NULL AND entry.amount > 0;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS routes_sync_completed_finances ON public.routes;
CREATE TRIGGER routes_sync_completed_finances
AFTER INSERT OR UPDATE OR DELETE ON public.routes
FOR EACH ROW EXECUTE FUNCTION public.sync_completed_route_finances();

-- Apply ledger entries to any completed routes already present without changing vehicle usage.
UPDATE public.routes SET price_charged = price_charged WHERE status = 'concluida';
