-- Cadastro de motoristas e clientes pode ser arquivado sem apagar o histórico.
-- Confere o schema atual: vehicles já possui status; estas tabelas ainda não.
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS status boolean;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS status boolean;

UPDATE public.drivers SET status = true WHERE status IS NULL;
UPDATE public.clients SET status = true WHERE status IS NULL;

ALTER TABLE public.drivers ALTER COLUMN status SET DEFAULT true;
ALTER TABLE public.drivers ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.clients ALTER COLUMN status SET DEFAULT true;
ALTER TABLE public.clients ALTER COLUMN status SET NOT NULL;
