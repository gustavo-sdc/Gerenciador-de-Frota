BEGIN;

-- Support tenant-scoped month paging, route history lookups, and cleanup of rate-limit rows.
CREATE INDEX IF NOT EXISTS finances_tenant_created_id_idx
  ON public.finances (tenant_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS routes_tenant_vehicle_created_idx
  ON public.routes (tenant_id, vehicle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS routes_tenant_status_created_idx
  ON public.routes (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS api_rate_limits_user_idx
  ON private.api_rate_limits (user_id);

-- Aggregate on the database rather than transferring every tenant row to the Edge Function.
CREATE OR REPLACE FUNCTION public.get_tenant_app_summary(
  p_tenant_id uuid,
  p_month_start date DEFAULT NULL,
  p_month_end date DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
        SELECT count(*)
        FROM public.maintenances m
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
        SELECT coalesce(sum(f.coalesce_margin), 0)
        FROM (
          SELECT coalesce(r.price_charged, 0) - coalesce(r.fuel_cost, 0)
            - coalesce(r.driver_cost, 0) - coalesce(r.other_costs, 0) AS coalesce_margin
          FROM public.routes r WHERE r.tenant_id = p_tenant_id AND r.status = 'concluida'
        ) f
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
$$;

REVOKE ALL ON FUNCTION public.get_tenant_app_summary(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_app_summary(uuid, date, date) TO service_role;

COMMIT;
