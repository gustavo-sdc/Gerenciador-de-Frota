BEGIN;

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicle_category text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_vehicle_category_check'
      AND conrelid = 'public.vehicles'::regclass
  ) THEN
    ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_vehicle_category_check
      CHECK (vehicle_category IS NULL OR vehicle_category IN (
        'moto', 'carro_passeio', 'utilitario_medio', 'utilitario_grande', 'caminhao'
      ));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.maintenance_category_system_rules (
  system_code text NOT NULL REFERENCES public.maintenance_system_rules(system_code) ON DELETE CASCADE,
  vehicle_category text NOT NULL CHECK (vehicle_category IN (
    'moto', 'carro_passeio', 'utilitario_medio', 'utilitario_grande', 'caminhao'
  )),
  base_life_km numeric CHECK (base_life_km > 0),
  replacement_cost numeric CHECK (replacement_cost >= 0),
  formula_adjusted_life text NOT NULL DEFAULT 'base_life_km / factor_product',
  formula_cpk text NOT NULL DEFAULT 'replacement_cost / adjusted_life_km',
  formula_route_cost text NOT NULL DEFAULT 'cpk * route_km',
  basis_note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (system_code, vehicle_category),
  CHECK (length(formula_adjusted_life) <= 240),
  CHECK (length(formula_cpk) <= 240),
  CHECK (length(formula_route_cost) <= 240)
);

INSERT INTO public.maintenance_category_system_rules (
  system_code, vehicle_category, base_life_km, replacement_cost,
  formula_adjusted_life, formula_cpk, formula_route_cost, basis_note, is_active
)
SELECT s.system_code, category.vehicle_category, s.base_life_km, s.replacement_cost,
  s.formula_adjusted_life, s.formula_cpk, s.formula_route_cost,
  concat_ws(' ', s.basis_note, 'Valor-base inicial herdado; ajuste esta regra para a categoria e registre fonte/custo real.'),
  s.is_active
FROM public.maintenance_system_rules s
CROSS JOIN (VALUES
  ('moto'), ('carro_passeio'), ('utilitario_medio'), ('utilitario_grande'), ('caminhao')
) AS category(vehicle_category)
ON CONFLICT (system_code, vehicle_category) DO NOTHING;

ALTER TABLE public.maintenance_category_system_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_category_system_rules FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.maintenance_category_system_rules FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.maintenance_category_system_rules TO service_role;

COMMIT;
