BEGIN;

-- Platform support and model-specific CPK defaults. Administrative data is
-- accessed only through the authenticated Edge Function, never the Data API.

ALTER TABLE public.tenant_access
  ADD COLUMN IF NOT EXISTS access_type text NOT NULL DEFAULT 'manual'
    CHECK (access_type IN ('manual', 'paid', 'test', 'complimentary')),
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 4 AND 160),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 5000),
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('bug', 'question', 'access', 'billing', 'other')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_type text NOT NULL CHECK (author_type IN ('user', 'developer')),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  fingerprint text NOT NULL CHECK (length(fingerprint) BETWEEN 8 AND 128),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  stack text CHECK (stack IS NULL OR length(stack) <= 6000),
  route text CHECK (route IS NULL OR length(route) <= 240),
  app_version text CHECK (app_version IS NULL OR length(app_version) <= 40),
  platform text NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'android', 'ios', 'unknown')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),
  occurrences integer NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicle_catalog_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_catalog_brands_name_unique
  ON public.vehicle_catalog_brands (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.vehicle_catalog_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.vehicle_catalog_brands(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  vehicle_category text NOT NULL CHECK (vehicle_category IN ('moto', 'carro_passeio', 'utilitario_medio', 'utilitario_grande', 'caminhao')),
  year_start integer NOT NULL DEFAULT 1900 CHECK (year_start BETWEEN 1900 AND 2200),
  year_end integer NOT NULL DEFAULT 2200 CHECK (year_end BETWEEN year_start AND 2200),
  fuel_type text,
  engine_version text,
  source_note text,
  source_url text CHECK (source_url IS NULL OR length(source_url) <= 1000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicle_catalog_models_lookup_idx
  ON public.vehicle_catalog_models (brand_id, lower(btrim(name)), vehicle_category, year_start, year_end)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.vehicle_catalog_cpk_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.vehicle_catalog_models(id) ON DELETE CASCADE,
  system_code text NOT NULL REFERENCES public.maintenance_system_rules(system_code) ON DELETE RESTRICT,
  component_name text NOT NULL CHECK (length(btrim(component_name)) BETWEEN 1 AND 120),
  component_reference text CHECK (component_reference IS NULL OR length(component_reference) <= 160),
  base_life_km numeric CHECK (base_life_km IS NULL OR base_life_km > 0),
  replacement_cost numeric CHECK (replacement_cost IS NULL OR replacement_cost >= 0),
  source_note text,
  source_url text CHECK (source_url IS NULL OR length(source_url) <= 1000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, system_code, component_name)
);
CREATE INDEX IF NOT EXISTS vehicle_catalog_cpk_profiles_model_idx
  ON public.vehicle_catalog_cpk_profiles (model_id, system_code) WHERE is_active;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS catalog_model_id uuid REFERENCES public.vehicle_catalog_models(id) ON DELETE SET NULL;
ALTER TABLE public.vehicle_cpk_profiles
  ADD COLUMN IF NOT EXISTS source_catalog_profile_id uuid
    REFERENCES public.vehicle_catalog_cpk_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_tickets_queue_idx
  ON public.support_tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_tenant_idx
  ON public.support_tickets (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx
  ON public.support_ticket_messages (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS app_error_events_queue_idx
  ON public.app_error_events (status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS app_error_events_fingerprint_idx
  ON public.app_error_events (fingerprint, user_id, last_seen_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'support_tickets', 'support_ticket_messages', 'app_error_events',
    'vehicle_catalog_brands', 'vehicle_catalog_models', 'vehicle_catalog_cpk_profiles'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.tenant_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.tenant_access TO service_role;

-- Exact, unambiguous catalog match. User-entered vehicles remain supported;
-- ambiguous names never receive a model default accidentally.
CREATE OR REPLACE FUNCTION private.match_vehicle_catalog_model()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE matched_id uuid; matches integer;
BEGIN
  SELECT count(*), (array_agg(m.id))[1] INTO matches, matched_id
  FROM public.vehicle_catalog_models m
  JOIN public.vehicle_catalog_brands b ON b.id = m.brand_id
  WHERE m.is_active AND b.is_active
    AND lower(btrim(b.name)) = lower(btrim(NEW.brand))
    AND lower(btrim(m.name)) = lower(btrim(NEW.model))
    AND m.vehicle_category = NEW.vehicle_category
    AND (NEW.year IS NULL OR NEW.year BETWEEN m.year_start AND m.year_end)
    AND (m.engine_version IS NULL OR NEW.engine_version IS NULL
      OR lower(btrim(m.engine_version)) = lower(btrim(NEW.engine_version)));
  IF matches = 1 THEN NEW.catalog_model_id := matched_id;
  ELSE NEW.catalog_model_id := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.copy_catalog_cpk_to_vehicle(target_vehicle uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_tenant uuid; matched_model uuid;
BEGIN
  SELECT v.tenant_id, v.catalog_model_id INTO current_tenant, matched_model
    FROM public.vehicles v WHERE v.id = target_vehicle;
  IF current_tenant IS NULL OR matched_model IS NULL THEN RETURN; END IF;

  DELETE FROM public.vehicle_cpk_profiles p
  USING public.vehicle_catalog_cpk_profiles c
  WHERE c.model_id = matched_model AND NOT c.is_active
    AND p.tenant_id = current_tenant AND p.vehicle_id = target_vehicle
    AND p.source_catalog_profile_id = c.id;

  UPDATE public.vehicle_cpk_profiles p
  SET component_reference = c.component_reference,
      base_life_km = c.base_life_km,
      replacement_cost = c.replacement_cost,
      source_catalog_profile_id = c.id,
      updated_at = now()
  FROM public.vehicle_catalog_cpk_profiles c
  WHERE c.model_id = matched_model AND c.is_active
    AND p.tenant_id = current_tenant AND p.vehicle_id = target_vehicle
    AND p.system_code = c.system_code AND p.component_name = c.component_name
    AND p.source_catalog_profile_id IS NOT NULL;

  INSERT INTO public.vehicle_cpk_profiles
    (tenant_id, vehicle_id, system_code, component_name, component_reference,
     base_life_km, replacement_cost, source_catalog_profile_id)
  SELECT current_tenant, target_vehicle, c.system_code, c.component_name,
    c.component_reference, c.base_life_km, c.replacement_cost, c.id
  FROM public.vehicle_catalog_cpk_profiles c
  WHERE c.model_id = matched_model AND c.is_active
    AND NOT EXISTS (
      SELECT 1 FROM public.vehicle_cpk_profiles p
      WHERE p.tenant_id = current_tenant AND p.vehicle_id = target_vehicle
        AND p.system_code = c.system_code AND p.component_name = c.component_name
    );
END $$;

CREATE OR REPLACE FUNCTION private.seed_vehicle_catalog_cpk()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.copy_catalog_cpk_to_vehicle(NEW.id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.refresh_catalog_model_vehicles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.vehicles v SET catalog_model_id = NEW.id
  FROM public.vehicle_catalog_brands b
  WHERE b.id = NEW.brand_id AND b.is_active AND NEW.is_active
    AND lower(btrim(v.brand)) = lower(btrim(b.name))
    AND lower(btrim(v.model)) = lower(btrim(NEW.name))
    AND v.vehicle_category = NEW.vehicle_category
    AND (v.year IS NULL OR v.year BETWEEN NEW.year_start AND NEW.year_end)
    AND (NEW.engine_version IS NULL OR v.engine_version IS NULL
      OR lower(btrim(v.engine_version)) = lower(btrim(NEW.engine_version)))
    AND NOT EXISTS (
      SELECT 1 FROM public.vehicle_catalog_models other
      JOIN public.vehicle_catalog_brands other_brand ON other_brand.id = other.brand_id
      WHERE other.id <> NEW.id AND other.is_active AND other_brand.is_active
        AND lower(btrim(other_brand.name)) = lower(btrim(v.brand))
        AND lower(btrim(other.name)) = lower(btrim(v.model))
        AND other.vehicle_category = v.vehicle_category
        AND (v.year IS NULL OR v.year BETWEEN other.year_start AND other.year_end)
        AND (other.engine_version IS NULL OR v.engine_version IS NULL
          OR lower(btrim(other.engine_version)) = lower(btrim(v.engine_version)))
    )
    AND v.catalog_model_id IS NULL;
  PERFORM private.copy_catalog_cpk_to_vehicle(v.id)
    FROM public.vehicles v WHERE v.catalog_model_id = NEW.id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.refresh_catalog_cpk_vehicles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.copy_catalog_cpk_to_vehicle(v.id)
    FROM public.vehicles v WHERE v.catalog_model_id = NEW.model_id;
  RETURN NEW;
END $$;

CREATE TRIGGER match_vehicle_catalog_model
  BEFORE INSERT OR UPDATE OF brand, model, year, vehicle_category, engine_version
  ON public.vehicles FOR EACH ROW EXECUTE FUNCTION private.match_vehicle_catalog_model();
CREATE TRIGGER seed_vehicle_catalog_cpk
  AFTER INSERT ON public.vehicles FOR EACH ROW EXECUTE FUNCTION private.seed_vehicle_catalog_cpk();
CREATE TRIGGER refresh_catalog_model_vehicles
  AFTER INSERT OR UPDATE OF brand_id, name, vehicle_category, year_start, year_end, engine_version, is_active
  ON public.vehicle_catalog_models FOR EACH ROW EXECUTE FUNCTION private.refresh_catalog_model_vehicles();
CREATE TRIGGER refresh_catalog_cpk_vehicles
  AFTER INSERT OR UPDATE OF system_code, component_name, component_reference, base_life_km, replacement_cost, is_active
  ON public.vehicle_catalog_cpk_profiles FOR EACH ROW EXECUTE FUNCTION private.refresh_catalog_cpk_vehicles();

REVOKE ALL ON FUNCTION private.match_vehicle_catalog_model() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.copy_catalog_cpk_to_vehicle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.seed_vehicle_catalog_cpk() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.refresh_catalog_model_vehicles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.refresh_catalog_cpk_vehicles() FROM PUBLIC, anon, authenticated;

COMMIT;
