-- A recurring route represents one occurrence repeated on selected calendar dates.
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_occurrence_count_check') THEN
    ALTER TABLE public.routes ADD CONSTRAINT routes_occurrence_count_check CHECK (occurrence_count BETWEEN 1 AND 1000);
  END IF;
END $$;

ALTER TABLE public.finances
  ADD COLUMN IF NOT EXISTS route_occurrence_date date;

DROP INDEX IF EXISTS public.finances_route_category_unique;
CREATE UNIQUE INDEX finances_route_occurrence_category_unique
  ON public.finances (tenant_id, related_route_id, route_occurrence_date, route_finance_category)
  WHERE route_finance_category IS NOT NULL;

CREATE OR REPLACE FUNCTION public.route_occurrence_dates(
  p_start date,
  p_end date,
  p_periodicity text,
  p_other_count integer,
  p_fallback date
)
RETURNS SETOF date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  first_day date := COALESCE(p_start, p_end, p_fallback);
  last_day date := COALESCE(p_end, p_start, p_fallback);
  current_day date;
  month_start date;
  day_index integer := 0;
  month_index integer := 0;
  span_days integer;
  repeat_count integer;
BEGIN
  IF first_day IS NULL THEN RETURN; END IF;
  IF last_day < first_day THEN RAISE EXCEPTION 'route period end precedes start'; END IF;
  IF p_periodicity = 'esporadica' OR last_day = first_day THEN
    RETURN NEXT first_day;
    RETURN;
  END IF;

  IF p_periodicity = 'diaria' THEN
    current_day := first_day;
    WHILE current_day <= last_day LOOP RETURN NEXT current_day; current_day := current_day + 1; END LOOP;
  ELSIF p_periodicity = 'semanal' OR p_periodicity = 'quinzenal' THEN
    current_day := first_day;
    WHILE current_day <= last_day LOOP
      RETURN NEXT current_day;
      current_day := current_day + CASE WHEN p_periodicity = 'semanal' THEN 7 ELSE 14 END;
    END LOOP;
  ELSIF p_periodicity = 'mensal' THEN
    LOOP
      month_start := (date_trunc('month', first_day)::date + make_interval(months => month_index))::date;
      current_day := month_start + LEAST(EXTRACT(day FROM first_day)::integer,
        EXTRACT(day FROM (month_start + interval '1 month - 1 day'))::integer) - 1;
      EXIT WHEN current_day > last_day;
      RETURN NEXT current_day;
      month_index := month_index + 1;
    END LOOP;
  ELSIF p_periodicity = 'outros' THEN
    repeat_count := GREATEST(COALESCE(p_other_count, 1), 1);
    span_days := last_day - first_day;
    FOR day_index IN 0..repeat_count - 1 LOOP
      current_day := first_day + ROUND(day_index::numeric * span_days / GREATEST(repeat_count - 1, 1))::integer;
      RETURN NEXT current_day;
    END LOOP;
  ELSE
    RETURN NEXT first_day;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.account_completed_route_usage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  old_contribution boolean := false;
  new_contribution boolean := false;
  usage_changed boolean := false;
  period_start date;
  period_end date;
  fallback_day date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.usage_accounted AND OLD.status = 'concluida' AND OLD.vehicle_id IS NOT NULL THEN
      UPDATE public.vehicles
      SET km_atual = GREATEST(km_atual - OLD.km_total * OLD.occurrence_count, km_aquisicao),
          start_cycles_total = GREATEST(start_cycles_total - OLD.stop_count * OLD.occurrence_count, 0)
      WHERE id = OLD.vehicle_id AND tenant_id = OLD.tenant_id;
    END IF;
    RETURN OLD;
  END IF;

  period_start := CASE WHEN NEW.start_time IS NULL THEN NULL ELSE NEW.start_time::date END;
  period_end := CASE WHEN NEW.end_time IS NULL THEN NULL ELSE NEW.end_time::date END;
  fallback_day := COALESCE(period_end, period_start, CURRENT_DATE);
  NEW.occurrence_count := (SELECT COUNT(*)::integer FROM public.route_occurrence_dates(
    period_start, period_end, NEW.route_periodicity, NEW.other_frequency_count, fallback_day));
  NEW.occurrence_count := GREATEST(NEW.occurrence_count, 1);

  IF TG_OP = 'UPDATE' THEN
    old_contribution := OLD.usage_accounted AND OLD.status = 'concluida' AND OLD.vehicle_id IS NOT NULL;
    usage_changed := NEW.status IS DISTINCT FROM OLD.status
      OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
      OR NEW.km_total * NEW.occurrence_count IS DISTINCT FROM OLD.km_total * OLD.occurrence_count
      OR NEW.stop_count * NEW.occurrence_count IS DISTINCT FROM OLD.stop_count * OLD.occurrence_count;
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
    SET km_atual = GREATEST(km_atual - OLD.km_total * OLD.occurrence_count, km_aquisicao),
        start_cycles_total = GREATEST(start_cycles_total - OLD.stop_count * OLD.occurrence_count, 0)
    WHERE id = OLD.vehicle_id AND tenant_id = OLD.tenant_id;
  END IF;

  IF new_contribution THEN
    UPDATE public.vehicles
    SET km_atual = km_atual + NEW.km_total * NEW.occurrence_count,
        start_cycles_total = start_cycles_total + NEW.stop_count * NEW.occurrence_count
    WHERE id = NEW.vehicle_id AND tenant_id = NEW.tenant_id;
  END IF;

  NEW.usage_accounted := new_contribution;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS routes_account_completed_usage ON public.routes;
CREATE TRIGGER routes_account_completed_usage
BEFORE INSERT OR UPDATE OF status, km_total, stop_count, vehicle_id, route_periodicity, other_frequency_count, start_time, end_time, occurrence_count
ON public.routes FOR EACH ROW EXECUTE FUNCTION public.account_completed_route_usage();

CREATE OR REPLACE FUNCTION public.sync_completed_route_finances()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  route_row public.routes%ROWTYPE;
  occurrence record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.finances WHERE tenant_id = OLD.tenant_id AND related_route_id = OLD.id AND route_finance_category IS NOT NULL;
    RETURN OLD;
  END IF;

  route_row := NEW;
  DELETE FROM public.finances WHERE tenant_id = route_row.tenant_id AND related_route_id = route_row.id AND route_finance_category IS NOT NULL;

  IF route_row.status = 'concluida' THEN
    FOR occurrence IN
      SELECT dates.occurrence_date
      FROM public.route_occurrence_dates(
        CASE WHEN route_row.start_time IS NULL THEN NULL ELSE route_row.start_time::date END,
        CASE WHEN route_row.end_time IS NULL THEN NULL ELSE route_row.end_time::date END,
        route_row.route_periodicity, route_row.other_frequency_count,
        COALESCE(route_row.end_time::date, route_row.start_time::date, route_row.created_at::date, CURRENT_DATE)
      ) AS dates(occurrence_date)
    LOOP
      INSERT INTO public.finances (tenant_id, type, description, amount, related_route_id, route_finance_category, route_occurrence_date, created_at)
      SELECT route_row.tenant_id, entry.type,
        entry.description || to_char(occurrence.occurrence_date, 'DD/MM/YYYY'),
        entry.amount, route_row.id, entry.category, occurrence.occurrence_date, occurrence.occurrence_date::timestamp
      FROM (VALUES
        ('entrada'::text, 'Receita da rota • ', route_row.price_charged, 'receita'::text),
        ('saida'::text, 'Combustível da rota • ', route_row.fuel_cost, 'combustivel'::text),
        ('saida'::text, 'Manutenção prevista da rota • ', route_row.maintenance_cost, 'manutencao'::text),
        ('saida'::text, 'Motorista da rota • ', route_row.driver_cost, 'motorista'::text),
        ('saida'::text, 'Outros custos da rota • ', route_row.other_costs, 'outros'::text)
      ) AS entry(type, description, amount, category)
      WHERE entry.amount IS NOT NULL AND entry.amount > 0;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_tenant_app_summary(
  p_tenant_id uuid, p_month_start date DEFAULT NULL, p_month_end date DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'counts', jsonb_build_object(
      'vehicles', (SELECT count(*) FROM public.vehicles v WHERE v.tenant_id = p_tenant_id),
      'drivers', (SELECT count(*) FROM public.drivers d WHERE d.tenant_id = p_tenant_id),
      'clients', (SELECT count(*) FROM public.clients c WHERE c.tenant_id = p_tenant_id),
      'routes', (SELECT count(*) FROM public.routes r WHERE r.tenant_id = p_tenant_id),
      'maintenances', (SELECT count(*) FROM public.maintenances m WHERE m.tenant_id = p_tenant_id),
      'finances', (SELECT count(*) FROM public.finances f WHERE f.tenant_id = p_tenant_id)
    ),
    'insights', jsonb_build_object(
      'activeVehicles', (SELECT count(*) FROM public.vehicles v WHERE v.tenant_id = p_tenant_id AND v.status IS TRUE),
      'pendingRoutes', (SELECT count(*) FROM public.routes r WHERE r.tenant_id = p_tenant_id AND r.status = 'pendente'),
      'dueMaintenances', (
        SELECT count(*) FROM public.maintenances m
        LEFT JOIN public.vehicles v ON v.tenant_id = m.tenant_id AND v.id = m.vehicle_id
        WHERE m.tenant_id = p_tenant_id
          AND ((m.next_date IS NOT NULL AND m.next_date <= current_date + 30)
            OR (m.km_agendado IS NOT NULL AND v.km_atual IS NOT NULL AND m.km_agendado <= v.km_atual))
      ),
      'financeNet', (
        SELECT coalesce(sum(CASE WHEN f.type = 'entrada' THEN f.amount ELSE -f.amount END), 0)
        FROM public.finances f WHERE f.tenant_id = p_tenant_id
      ),
      'completedMargin', (
        SELECT coalesce(sum((coalesce(r.price_charged, 0) - coalesce(r.fuel_cost, 0)
          - coalesce(r.maintenance_cost, 0) - coalesce(r.driver_cost, 0) - coalesce(r.other_costs, 0))
          * coalesce(r.occurrence_count, 1)), 0)
        FROM public.routes r WHERE r.tenant_id = p_tenant_id AND r.status = 'concluida'
      )
    ),
    'month_finance', jsonb_build_object(
      'income', (
        SELECT coalesce(sum(f.amount), 0) FROM public.finances f
        WHERE f.tenant_id = p_tenant_id AND f.type = 'entrada'
          AND p_month_start IS NOT NULL AND p_month_end IS NOT NULL
          AND f.created_at >= p_month_start::timestamp AND f.created_at < p_month_end::timestamp
      ),
      'expense', (
        SELECT coalesce(sum(f.amount), 0) FROM public.finances f
        WHERE f.tenant_id = p_tenant_id AND f.type = 'saida'
          AND p_month_start IS NOT NULL AND p_month_end IS NOT NULL
          AND f.created_at >= p_month_start::timestamp AND f.created_at < p_month_end::timestamp
      )
    )
  );
$function$;

-- Reconcile recorded odometer totals and regenerate completed-route ledger entries.
UPDATE public.routes SET occurrence_count = occurrence_count;
