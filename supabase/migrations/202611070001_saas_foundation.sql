-- Execute integralmente no SQL Editor do Supabase, como postgres.
-- Base: schema fornecido em 07/11/2026. Não apaga registros.
-- Valores financeiros em reais (numeric), nunca em centavos inteiros.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- O proprietário atual recebe um perfil; conflitos exigem revisão manual.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenants t JOIN public.profiles p ON p.id = t.user_id
    WHERE p.tenant_id <> t.id
  ) THEN
    RAISE EXCEPTION 'Proprietário associado a outra empresa em profiles. Corrija antes de executar.';
  END IF;
END $$;

INSERT INTO public.profiles (id, tenant_id, role)
SELECT user_id, id, 'admin' FROM public.tenants
ON CONFLICT (id) DO UPDATE SET role = 'admin';

ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;
DO $$
DECLARE existing_fk record;
BEGIN
  SELECT c.confrelid, c.contype INTO existing_fk
  FROM pg_constraint c
  WHERE c.conrelid = 'public.profiles'::regclass
    AND c.conname = 'profiles_auth_user_fkey';
  IF NOT FOUND THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_user_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT;
  ELSIF existing_fk.contype <> 'f' OR existing_fk.confrelid <> 'auth.users'::regclass THEN
    RAISE EXCEPTION 'profiles_auth_user_fkey existe com destino inesperado; revise a constraint antes de continuar.';
  END IF;
END $$;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Bloqueio pertence à assinatura da empresa. Sem integração de pagamento nesta etapa.
CREATE TABLE public.tenant_access (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'blocked', 'cancelled')),
  access_until timestamptz,
  blocked_at timestamptz,
  block_reason text CHECK (block_reason IN ('nonpayment', 'administrative', 'security')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_access_block_consistency CHECK (
    (status = 'blocked' AND blocked_at IS NOT NULL AND block_reason IS NOT NULL)
    OR (status <> 'blocked' AND blocked_at IS NULL AND block_reason IS NULL)
  )
);
INSERT INTO public.tenant_access (tenant_id) SELECT id FROM public.tenants;

CREATE FUNCTION private.initialize_tenant_access() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.tenant_access (tenant_id) VALUES (NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER initialize_tenant_access AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION private.initialize_tenant_access();

-- Remove o relacionamento incorreto motorista -> veículo.
ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_driver_id_fkey1;

-- Converte apenas associações antigas inequívocas de manutenção por id_plate.
DO $$
DECLARE column_type text;
BEGIN
  SELECT data_type INTO column_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'maintenances' AND column_name = 'vehicle_id';
  IF column_type IN ('bigint', 'integer') THEN
    IF EXISTS (
      SELECT 1 FROM public.maintenances m WHERE m.vehicle_id IS NOT NULL
      AND (SELECT count(*) FROM public.vehicles v
           WHERE v.tenant_id = m.tenant_id AND v.id_plate = m.vehicle_id) <> 1
    ) THEN
      RAISE EXCEPTION 'Manutenções com vehicle_id legado sem correspondência única em vehicles.id_plate. Resolva o mapeamento antes de executar.';
    END IF;
    ALTER TABLE public.maintenances ADD COLUMN vehicle_uuid uuid;
    UPDATE public.maintenances m SET vehicle_uuid = v.id
      FROM public.vehicles v WHERE v.tenant_id = m.tenant_id AND v.id_plate = m.vehicle_id;
    -- Mantém o identificador antigo para conferência.
    ALTER TABLE public.maintenances RENAME COLUMN vehicle_id TO legacy_vehicle_id;
    ALTER TABLE public.maintenances RENAME COLUMN vehicle_uuid TO vehicle_id;
  ELSIF column_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'Tipo inesperado para maintenances.vehicle_id: %', column_type;
  END IF;
END $$;

-- FKs compostas impedem associações entre empresas diferentes.
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE public.drivers ADD CONSTRAINT drivers_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE public.clients ADD CONSTRAINT clients_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE public.routes ADD CONSTRAINT routes_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE public.maintenances ADD CONSTRAINT maintenances_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE public.routes ADD CONSTRAINT routes_tenant_vehicle_fkey
  FOREIGN KEY (tenant_id, vehicle_id) REFERENCES public.vehicles(tenant_id, id);
ALTER TABLE public.routes ADD CONSTRAINT routes_tenant_driver_fkey
  FOREIGN KEY (tenant_id, driver_id) REFERENCES public.drivers(tenant_id, id);
ALTER TABLE public.routes ADD CONSTRAINT routes_tenant_client_fkey
  FOREIGN KEY (tenant_id, client_id) REFERENCES public.clients(tenant_id, id);
ALTER TABLE public.maintenances ADD CONSTRAINT maintenances_tenant_vehicle_fkey
  FOREIGN KEY (tenant_id, vehicle_id) REFERENCES public.vehicles(tenant_id, id);
ALTER TABLE public.finances ADD CONSTRAINT finances_tenant_maintenance_fkey
  FOREIGN KEY (tenant_id, related_maintenance_id) REFERENCES public.maintenances(tenant_id, id);
ALTER TABLE public.finances ADD CONSTRAINT finances_tenant_route_fkey
  FOREIGN KEY (tenant_id, related_route_id) REFERENCES public.routes(tenant_id, id);

ALTER TABLE public.route_photos ADD COLUMN tenant_id uuid;
UPDATE public.route_photos p SET tenant_id = r.tenant_id FROM public.routes r WHERE r.id = p.route_id;
ALTER TABLE public.route_photos ALTER COLUMN route_id SET NOT NULL;
ALTER TABLE public.route_photos ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.route_photos ADD CONSTRAINT route_photos_tenant_route_fkey
  FOREIGN KEY (tenant_id, route_id) REFERENCES public.routes(tenant_id, id);

ALTER TABLE public.vehicles ALTER COLUMN status SET DEFAULT true;
UPDATE public.vehicles SET status = true WHERE status IS NULL;
ALTER TABLE public.vehicles ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_km_check
  CHECK (km_aquisicao >= 0 AND km_atual >= km_aquisicao);
ALTER TABLE public.drivers ADD CONSTRAINT drivers_pay_check CHECK (pay_per_day >= 0);
ALTER TABLE public.maintenances ADD CONSTRAINT maintenances_values_check
  CHECK (cost >= 0 AND (km_agendado IS NULL OR km_agendado >= 0)
    AND (next_date IS NULL OR next_date >= date_service));
ALTER TABLE public.routes ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.routes ADD CONSTRAINT routes_values_check
  CHECK (km_total >= 0 AND fuel_cost >= 0 AND driver_cost >= 0 AND other_costs >= 0
    AND price_charged >= 0 AND (end_time IS NULL OR (start_time IS NOT NULL AND end_time >= start_time)));
ALTER TABLE public.finances ALTER COLUMN amount TYPE numeric USING amount::numeric;
ALTER TABLE public.finances ALTER COLUMN amount SET NOT NULL;
ALTER TABLE public.finances ALTER COLUMN type SET NOT NULL;
ALTER TABLE public.finances ADD CONSTRAINT finances_amount_check CHECK (amount >= 0);

-- Perfil de motorista fica reservado: acesso operacional exigirá vínculo explícito
-- entre auth.users e drivers e políticas específicas, numa próxima migration.
CREATE FUNCTION private.can_manage_tenant(target_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.tenant_access a ON a.tenant_id = p.tenant_id
    WHERE p.id = (SELECT auth.uid()) AND p.tenant_id = target_tenant
      AND p.role IN ('admin', 'gestor') AND a.status = 'active'
      AND (a.access_until IS NULL OR a.access_until > now())
  );
$$;
REVOKE ALL ON FUNCTION private.can_manage_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_tenant(uuid) TO authenticated, service_role;

-- Consulta mínima para exibir o motivo de bloqueio sem liberar dados operacionais.
CREATE FUNCTION public.get_my_access() RETURNS TABLE (
  tenant_id uuid, role text, status text, access_until timestamptz, block_reason text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.tenant_id, p.role, a.status, a.access_until, a.block_reason
  FROM public.profiles p JOIN public.tenant_access a ON a.tenant_id = p.tenant_id
  WHERE p.id = (SELECT auth.uid());
$$;
REVOKE ALL ON FUNCTION public.get_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated, service_role;

-- Substitui políticas antigas destas tabelas: políticas permissivas somam acesso.
DO $$
DECLARE item record; table_name text;
BEGIN
  FOR item IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY (ARRAY[
      'tenants','profiles','vehicles','drivers','clients','routes','maintenances',
      'finances','route_photos','tenant_access'])
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', item.policyname, item.tablename);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['tenants','profiles','vehicles','drivers','clients',
    'routes','maintenances','finances','route_photos','tenant_access']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
  END LOOP;
  -- Backend obrigatório: JWT do usuário preservado nas consultas de leitura.
  -- Escritas são reservadas às Edge Functions usando service_role após autorização.
  FOREACH table_name IN ARRAY ARRAY['vehicles','drivers','clients','routes',
    'maintenances','finances','route_photos']
  LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', table_name);
    EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING (private.can_manage_tenant(tenant_id))', table_name);
  END LOOP;
END $$;
GRANT SELECT ON public.profiles, public.tenants TO authenticated;
CREATE POLICY own_profile ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));
CREATE POLICY own_tenant ON public.tenants FOR SELECT TO authenticated
  USING (private.can_manage_tenant(id));

-- Auditoria sem cópia de documentos, nomes, contatos ou payloads.
CREATE TABLE public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  actor_id uuid,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.audit_events TO service_role;

CREATE FUNCTION private.audit_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_data jsonb; company_id uuid; record_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN row_data := to_jsonb(OLD); ELSE row_data := to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME = 'tenants' THEN company_id := (row_data->>'id')::uuid;
  ELSE company_id := (row_data->>'tenant_id')::uuid; END IF;
  IF TG_TABLE_NAME = 'tenant_access' THEN record_id := company_id;
  ELSE record_id := (row_data->>'id')::uuid; END IF;
  INSERT INTO public.audit_events (tenant_id, actor_id, entity, entity_id, operation)
  VALUES (company_id, auth.uid(), TG_TABLE_NAME, record_id, TG_OP);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tenants','profiles','vehicles','drivers','clients',
    'routes','maintenances','finances','route_photos','tenant_access']
  LOOP
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.audit_change()', table_name);
    IF table_name NOT IN ('tenants','tenant_access') THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', table_name || '_tenant_idx', table_name);
    END IF;
  END LOOP;
END $$;
CREATE INDEX audit_events_tenant_time_idx ON public.audit_events (tenant_id, occurred_at DESC);
CREATE INDEX route_photos_route_idx ON public.route_photos (route_id);
CREATE INDEX routes_vehicle_idx ON public.routes (tenant_id, vehicle_id);
CREATE INDEX routes_driver_idx ON public.routes (tenant_id, driver_id);
CREATE INDEX routes_client_idx ON public.routes (tenant_id, client_id);
CREATE INDEX maintenances_vehicle_idx ON public.maintenances (tenant_id, vehicle_id);
CREATE INDEX finances_route_idx ON public.finances (tenant_id, related_route_id);
CREATE INDEX finances_maintenance_idx ON public.finances (tenant_id, related_maintenance_id);

REVOKE ALL ON FUNCTION private.initialize_tenant_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.audit_change() FROM PUBLIC, anon, authenticated;

COMMIT;
