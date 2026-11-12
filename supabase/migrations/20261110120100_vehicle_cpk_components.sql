BEGIN;

-- Cada linha representa um componente livre vinculado a um sistema do veículo.
ALTER TABLE public.vehicle_cpk_profiles
  DROP CONSTRAINT vehicle_cpk_profiles_pkey,
  ADD COLUMN id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN component_name text;

UPDATE public.vehicle_cpk_profiles p
SET component_name = s.name
FROM public.maintenance_system_rules s
WHERE s.system_code = p.system_code AND p.component_name IS NULL;

UPDATE public.vehicle_cpk_profiles SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE public.vehicle_cpk_profiles
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN component_name SET NOT NULL,
  ADD CONSTRAINT vehicle_cpk_profiles_pkey PRIMARY KEY (id),
  ADD CONSTRAINT vehicle_cpk_profiles_component_name_check
    CHECK (length(btrim(component_name)) BETWEEN 1 AND 120);

CREATE INDEX vehicle_cpk_profiles_vehicle_system_idx
  ON public.vehicle_cpk_profiles (tenant_id, vehicle_id, system_code);

COMMIT;
