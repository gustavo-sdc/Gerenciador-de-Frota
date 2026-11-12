BEGIN;

CREATE OR REPLACE FUNCTION public.delete_tenant_account_data(
  p_tenant_id uuid,
  p_owner_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = p_tenant_id AND t.user_id = p_owner_user_id
  ) THEN
    RAISE EXCEPTION 'Conta não é proprietária da empresa.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.route_photos WHERE tenant_id = p_tenant_id;
  DELETE FROM public.finances WHERE tenant_id = p_tenant_id;
  DELETE FROM public.maintenances WHERE tenant_id = p_tenant_id;
  DELETE FROM public.routes WHERE tenant_id = p_tenant_id;
  DELETE FROM public.drivers WHERE tenant_id = p_tenant_id;
  DELETE FROM public.clients WHERE tenant_id = p_tenant_id;
  DELETE FROM public.vehicles WHERE tenant_id = p_tenant_id;
  DELETE FROM public.tenant_access WHERE tenant_id = p_tenant_id;
  DELETE FROM public.profiles WHERE tenant_id = p_tenant_id;
  DELETE FROM public.tenants WHERE id = p_tenant_id;

  -- audit_events intentionally has no tenant FK; purge it with the tenant data.
  DELETE FROM public.audit_events WHERE tenant_id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_tenant_account_data(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_account_data(uuid, uuid) TO service_role;

COMMIT;
