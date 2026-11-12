BEGIN;

-- Cross-tenant rule authoring is isolated from tenant profile roles.
CREATE TABLE public.platform_developers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_developers (user_id)
SELECT id FROM auth.users WHERE lower(email) = lower('gustavo.s.d.c@outlook.com')
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE public.maintenance_system_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_code text NOT NULL UNIQUE CHECK (system_code ~ '^[a-z][a-z0-9_]{1,49}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  base_life_km numeric CHECK (base_life_km > 0),
  replacement_cost numeric CHECK (replacement_cost >= 0),
  formula_adjusted_life text NOT NULL DEFAULT 'base_life_km / factor_product',
  formula_cpk text NOT NULL DEFAULT 'replacement_cost / adjusted_life_km',
  formula_route_cost text NOT NULL DEFAULT 'cpk * route_km',
  basis_note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(formula_adjusted_life) <= 240),
  CHECK (length(formula_cpk) <= 240),
  CHECK (length(formula_route_cost) <= 240)
);

CREATE TABLE public.maintenance_rule_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_code text NOT NULL REFERENCES public.maintenance_system_rules(system_code) ON DELETE CASCADE,
  answer_key text NOT NULL CHECK (answer_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  question text NOT NULL CHECK (length(trim(question)) BETWEEN 5 AND 300),
  answer_type text NOT NULL DEFAULT 'select' CHECK (answer_type IN ('select', 'number')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  required boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (system_code, answer_key)
);

CREATE INDEX maintenance_rule_questions_order_idx
  ON public.maintenance_rule_questions (system_code, display_order, id)
  WHERE is_active;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['platform_developers','maintenance_system_rules','maintenance_rule_questions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

-- Initial baselines supplied in the technical brief. They are editable estimates,
-- not manufacturer-confirmed intervals; replacement costs intentionally start blank.
INSERT INTO public.maintenance_system_rules
  (system_code, name, base_life_km, basis_note)
VALUES
  ('oleo_motor', 'Óleo do motor', 10000, 'Referência inicial do relatório; confirme no manual da versão exata.'),
  ('filtros', 'Filtros', 20000, 'Referência inicial do relatório; confirme no manual da versão exata.'),
  ('pneus', 'Pneus', 50000, 'Referência inicial; priorize medições de sulco e histórico do próprio veículo.'),
  ('freios', 'Freios', 40000, 'Referência inicial; desgaste real depende de inspeção e uso.'),
  ('suspensao', 'Suspensão', 80000, 'Referência inicial do relatório; não substitui inspeção.'),
  ('arrefecimento', 'Arrefecimento', 60000, 'Referência inicial do relatório; verificar fluido e manual.'),
  ('direcao', 'Direção', 80000, 'Referência inicial do relatório; não substitui inspeção.'),
  ('injecao', 'Injeção', 50000, 'Referência inicial do relatório; requer diagnóstico conforme sintomas.'),
  ('ignicao', 'Ignição', 50000, 'Referência inicial do relatório; verificar aplicabilidade ao veículo.')
ON CONFLICT (system_code) DO NOTHING;

INSERT INTO public.maintenance_rule_questions
  (system_code, answer_key, question, answer_type, options, display_order)
VALUES
  ('suspensao','carga','Qual é a carga usual em relação à capacidade do veículo?','select',
    '[{"value":"ate_30","label":"Até 30%","multiplier":1.0},{"value":"31_70","label":"31% a 70%","multiplier":1.15},{"value":"71_100","label":"71% a 100%","multiplier":1.3},{"value":"sobrecarga","label":"Acima da capacidade","multiplier":1.5}]',10),
  ('suspensao','condicao_via','Qual condição de via predomina?','select',
    '[{"value":"asfalto_bom","label":"Asfalto bom","multiplier":1.0},{"value":"irregular","label":"Irregular / remendos","multiplier":1.25},{"value":"terra_esburacada","label":"Terra / esburacada","multiplier":1.6}]',20),
  ('suspensao','tipo_rota','Onde ocorre a maior parte do uso?','select',
    '[{"value":"rodovia","label":"Rodovia","multiplier":1.0},{"value":"cidade","label":"Cidade / urbano","multiplier":1.2}]',30),
  ('arrefecimento','tipo_rota','Onde ocorre a maior parte do uso?','select',
    '[{"value":"rodovia","label":"Rodovia","multiplier":1.0},{"value":"cidade","label":"Cidade / trânsito","multiplier":1.35}]',10),
  ('arrefecimento','carga_motor','Como é a carga e o relevo predominantes?','select',
    '[{"value":"leve_plano","label":"Leve / plano","multiplier":1.0},{"value":"pesada_aclive","label":"Pesada / aclives","multiplier":1.2}]',20),
  ('arrefecimento','qualidade_fluido','Qual fluido é usado no sistema?','select',
    '[{"value":"aditivo_desmineralizada","label":"Aditivo e água desmineralizada","multiplier":1.0},{"value":"agua_desmineralizada","label":"Somente água desmineralizada","multiplier":1.3},{"value":"agua_torneira","label":"Água de torneira","multiplier":1.9}]',30),
  ('direcao','condicao_via','Qual condição de via predomina?','select',
    '[{"value":"asfalto_bom","label":"Asfalto bom","multiplier":1.0},{"value":"irregular","label":"Irregular / esburacada","multiplier":1.4}]',10),
  ('direcao','manobrabilidade','Onde ocorre a maior parte das manobras?','select',
    '[{"value":"rodovia","label":"Rodovia","multiplier":1.0},{"value":"cidade_entregas","label":"Cidade / entregas urbanas","multiplier":1.3}]',20),
  ('injecao','tipo_rota','Onde ocorre a maior parte do uso?','select',
    '[{"value":"rodovia","label":"Rodovia","multiplier":1.0},{"value":"cidade","label":"Cidade / marcha lenta frequente","multiplier":1.3}]',10),
  ('injecao','qualidade_combustivel','Qual é a origem habitual do combustível?','select',
    '[{"value":"confiavel","label":"Posto próprio / confiável","multiplier":1.0},{"value":"desconhecido","label":"Rota remota / origem desconhecida","multiplier":1.15}]',20),
  ('ignicao','tipo_rota','Onde ocorre a maior parte do uso?','select',
    '[{"value":"rodovia","label":"Rodovia","multiplier":1.0},{"value":"cidade","label":"Cidade / congestionamento","multiplier":1.4}]',10)
ON CONFLICT (system_code, answer_key) DO NOTHING;

COMMIT;
