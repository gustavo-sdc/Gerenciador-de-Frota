BEGIN;

-- Valores de vida útil, custo e peça instaladas variam por veículo.
CREATE TABLE IF NOT EXISTS public.vehicle_cpk_profiles (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL,
  system_code text NOT NULL REFERENCES public.maintenance_system_rules(system_code) ON DELETE CASCADE,
  component_reference text CHECK (component_reference IS NULL OR length(component_reference) <= 120),
  base_life_km numeric CHECK (base_life_km IS NULL OR base_life_km > 0),
  replacement_cost numeric CHECK (replacement_cost IS NULL OR replacement_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, vehicle_id, system_code),
  CONSTRAINT vehicle_cpk_profiles_vehicle_fkey
    FOREIGN KEY (tenant_id, vehicle_id) REFERENCES public.vehicles(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE public.vehicle_cpk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_cpk_profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vehicle_cpk_profiles FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.vehicle_cpk_profiles TO service_role;

-- Guarda apenas valores personalizados. O cálculo usa a regra da categoria
-- quando não há personalização, mantendo atualizações globais como padrão.

COMMIT;
