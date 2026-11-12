# Aplicação

## Redis no controle de solicitações da API

A função `api` suporta Upstash Redis por HTTPS, sem dependências adicionais.
Configure os secrets da Edge Function no Supabase:

- `UPSTASH_REDIS_REST_URL`: endpoint HTTPS do banco Upstash.
- `UPSTASH_REDIS_REST_TOKEN`: token com permissão de escrita e EVAL.
- `REDIS_KEY_PREFIX`: namespace exclusivo do ambiente, por exemplo `garagem:production`
  ou `garagem:staging` (padrão: `transport-management:production`).

Nunca coloque esses valores em variáveis `VITE_*`, no frontend ou no Git.
Após configurar, publique a função `api` com a pasta `_shared`.
Sem URL e token, permanece o controle PostgreSQL existente. Configuração parcial,
timeout ou erro do Redis retorna 503, sem alternar contadores e conceder nova cota.
Os limites existentes são preservados: 120 leituras/minuto, 60 escritas/minuto,
20 previsões/hora por empresa e usuário. O Redis usa janela iniciada na primeira
solicitação, com incremento e expiração atômicos; não armazena dados de negócio.
Ao ativar/desativar o backend, os contadores não são migrados: faça a troca em
período de baixo uso, considerando que uma nova cota será iniciada.

Teste local do adaptador (Node 22):
`node --experimental-strip-types --test supabase/functions/_shared/redis-rate-limit.test.mjs`
Os testes simulam HTTP; antes de produção, valide também uma solicitação autenticada
com os secrets reais e confira no Redis uma chave `rate:v1` com TTL positivo.

Referências: [REST do Upstash](https://upstash.com/docs/redis/features/restapi),
[secrets das Edge Functions](https://supabase.com/docs/guides/functions/secrets).

Execute `migrations/202611070001_saas_foundation.sql` integralmente no SQL Editor,
como `postgres`, uma única vez. Faça um backup antes. Qualquer erro reverte a
transação; não execute trechos isolados. O arquivo pressupõe o schema informado.

Esta migration substitui as políticas RLS das tabelas listadas e reserva as
escritas ao backend. O frontend atual precisará das Edge Functions para gravar.
Leituras autenticadas ficam restritas a gestores/admins de empresas liberadas.
Não altera políticas de Storage: fotos devem usar buckets privados e URLs
assinadas, configurados na implementação desse módulo.

Empresas existentes começam ativas, sem vencimento. Para bloquear:

```sql
UPDATE public.tenant_access
SET status = 'blocked', blocked_at = now(), block_reason = 'nonpayment', updated_at = now()
WHERE tenant_id = 'UUID_DA_EMPRESA';
```

Para liberar:

```sql
UPDATE public.tenant_access
SET status = 'active', blocked_at = NULL, block_reason = NULL,
    access_until = NULL, updated_at = now()
WHERE tenant_id = 'UUID_DA_EMPRESA';
```

`access_until` representa vencimento opcional. As Edge Functions deverão validar
o JWT, consultar o perfil e `tenant_access` e validar a empresa antes de **cada**
operação com `service_role`, inclusive leituras, Storage e exportações. Essa chave
ignora RLS e nunca deve ir para o frontend. A RPC `get_my_access()` aceita a sessão
do usuário e informa o acesso mesmo quando bloqueado. Cadastro de empresa,
proprietário e perfil deverá ocorrer em transação no backend.

Auditoria não copia conteúdo pessoal; chamadas com `service_role` podem registrar
`actor_id` nulo. Atribuição confiável do usuário e escritas atômicas com auditoria
exigirão RPCs específicas no backend. Não confiar em headers de ator enviados
pelo cliente. Proprietários recebem `admin`; motoristas ainda não têm acesso
operacional. Um usuário pertence a uma empresa nesta versão.

Não há exclusão automática nem prazo de retenção presumido. Antes da produção,
definir bases legais, prazos por categoria, atendimento aos titulares, anonimização,
tratamento de backups, região de hospedagem e contratos. Esta migration é uma
base técnica, não uma certificação LGPD. Logs de auditoria também exigem retenção.

Manutenções com IDs numéricos só são convertidas quando existe correspondência
única por empresa em `vehicles.id_plate`; o valor antigo é preservado em
`legacy_vehicle_id`. Registros órfãos, relações entre empresas, valores inválidos
e campos obrigatórios nulos interrompem a migration para correção explícita.
Os inteiros de `finances.amount` são preservados como reais, sem divisão por 100.

Validação remota não realizada: não há conexão administrativa disponível nesta
sessão. Após aplicar, testar com duas empresas, usuário bloqueado, gestor,
motorista e sessão anônima antes de usar dados reais.
