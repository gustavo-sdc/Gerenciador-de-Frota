-- Atomically associate an authenticated signup with exactly one tenant.
CREATE OR REPLACE FUNCTION public.create_tenant_for_user(
  p_user_id uuid,
  p_cnpj text,
  p_name text
)
RETURNS TABLE (tenant_id uuid, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  existing_profile_tenant uuid;
  existing_role text;
  owner_tenant_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_cnpj IS NULL OR p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Dados de empresa inválidos' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  SELECT p.tenant_id, p.role
  INTO existing_profile_tenant, existing_role
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF existing_profile_tenant IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.tenants AS t
      WHERE t.id = existing_profile_tenant AND t.user_id = p_user_id
    ) THEN
      tenant_id := existing_profile_tenant;
      role := existing_role;
      RETURN NEXT;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Esta conta já pertence a uma empresa' USING ERRCODE = '23505';
  END IF;

  SELECT t.id INTO owner_tenant_id
  FROM public.tenants AS t
  WHERE t.user_id = p_user_id;

  IF owner_tenant_id IS NULL THEN
    INSERT INTO public.tenants (cnpj, name, user_id)
    VALUES (p_cnpj, btrim(p_name), p_user_id)
    RETURNING id INTO owner_tenant_id;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, role)
  VALUES (p_user_id, owner_tenant_id, 'admin');

  tenant_id := owner_tenant_id;
  role := 'admin';
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_tenant_for_user(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_for_user(uuid, text, text) TO service_role;
