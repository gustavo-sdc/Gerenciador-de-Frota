BEGIN;

-- Keep the legacy cnpj column for existing integrations, while storing the
-- canonical identifier and its kind for both individual and business tenants.
ALTER TABLE public.tenants ALTER COLUMN cnpj DROP NOT NULL;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'cnpj';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS document_number text;
UPDATE public.tenants SET document_number = cnpj WHERE document_number IS NULL;
ALTER TABLE public.tenants ALTER COLUMN document_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenants'::regclass AND conname = 'tenants_document_type_check') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_document_type_check
      CHECK (document_type IN ('cpf', 'cnpj'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenants'::regclass AND conname = 'tenants_document_consistency_check') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_document_consistency_check
      CHECK (
        (document_type = 'cnpj' AND cnpj IS NOT NULL AND document_number = cnpj
          AND document_number ~ '^[A-Z0-9]{12}[0-9]{2}$')
        OR
        (document_type = 'cpf' AND cnpj IS NULL AND document_number ~ '^[0-9]{11}$')
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_cpf_unique_idx
  ON public.tenants (document_number) WHERE document_type = 'cpf';

CREATE OR REPLACE FUNCTION public.create_tenant_for_user(
  p_user_id uuid,
  p_document_type text,
  p_document_number text,
  p_name text
)
RETURNS TABLE (tenant_id uuid, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE existing_profile_tenant uuid; existing_role text; owner_tenant_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_document_type NOT IN ('cpf', 'cnpj')
    OR p_document_number IS NULL OR p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Dados de cadastro inválidos' USING ERRCODE = '22023';
  END IF;
  IF p_document_type = 'cpf' AND p_document_number !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'CPF inválido' USING ERRCODE = '22023';
  END IF;
  IF p_document_type = 'cnpj' AND p_document_number !~ '^[A-Z0-9]{12}[0-9]{2}$' THEN
    RAISE EXCEPTION 'CNPJ inválido' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  SELECT p.tenant_id, p.role INTO existing_profile_tenant, existing_role
    FROM public.profiles p WHERE p.id = p_user_id;
  IF existing_profile_tenant IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = existing_profile_tenant AND t.user_id = p_user_id) THEN
      tenant_id := existing_profile_tenant; role := existing_role; RETURN NEXT; RETURN;
    END IF;
    RAISE EXCEPTION 'Esta conta já pertence a uma empresa' USING ERRCODE = '23505';
  END IF;

  SELECT t.id INTO owner_tenant_id FROM public.tenants t WHERE t.user_id = p_user_id;
  IF owner_tenant_id IS NULL THEN
    INSERT INTO public.tenants (cnpj, document_type, document_number, name, user_id)
    VALUES (CASE WHEN p_document_type = 'cnpj' THEN p_document_number ELSE NULL END,
      p_document_type, p_document_number, btrim(p_name), p_user_id)
    RETURNING id INTO owner_tenant_id;
  END IF;
  INSERT INTO public.profiles (id, tenant_id, role) VALUES (p_user_id, owner_tenant_id, 'admin');
  tenant_id := owner_tenant_id; role := 'admin'; RETURN NEXT;
END;
$function$;

-- Keep the old service-role signature working for older deployed clients.
CREATE OR REPLACE FUNCTION public.create_tenant_for_user(
  p_user_id uuid, p_cnpj text, p_name text
)
RETURNS TABLE (tenant_id uuid, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  RETURN QUERY SELECT * FROM public.create_tenant_for_user(p_user_id, 'cnpj', p_cnpj, p_name);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_tenant_for_user(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_for_user(uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_tenant_for_user(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_for_user(uuid, text, text) TO service_role;

COMMIT;
