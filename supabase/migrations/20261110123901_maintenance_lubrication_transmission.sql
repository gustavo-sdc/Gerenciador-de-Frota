BEGIN;

-- "Óleo do motor" passa a ser o item padrão do sistema Lubrificação.
-- O código interno é preservado para manter referências e respostas existentes.
UPDATE public.maintenance_system_rules
SET name = 'Lubrificação', updated_at = now()
WHERE system_code = 'oleo_motor';

INSERT INTO public.maintenance_system_rules
  (system_code, name, base_life_km, replacement_cost, basis_note, is_active)
VALUES
  ('transmissao', 'Transmissão', NULL, NULL,
   'Configure intervalos e custos conforme o manual e os itens instalados neste veículo.', true)
ON CONFLICT (system_code) DO UPDATE
SET name = EXCLUDED.name, is_active = true, updated_at = now();

INSERT INTO public.maintenance_category_system_rules
  (system_code, vehicle_category, base_life_km, replacement_cost, basis_note, is_active)
SELECT 'transmissao', category.vehicle_category, NULL, NULL,
  'Preencha vida útil e custo conforme o veículo e o componente cadastrado.', true
FROM (VALUES
  ('moto'), ('carro_passeio'), ('utilitario_medio'), ('utilitario_grande'), ('caminhao')
) AS category(vehicle_category)
ON CONFLICT (system_code, vehicle_category) DO UPDATE
SET is_active = true, updated_at = now();

COMMIT;
