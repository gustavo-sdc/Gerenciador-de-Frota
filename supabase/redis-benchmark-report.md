# Comparação Redis e PostgreSQL — 12/11/2026

Teste remoto do controle de solicitações, usando a mesma RPC PostgreSQL e o mesmo
adaptador Redis da API. Não mede o carregamento completo de páginas nem cache de dados.

Por região: 3 aquecimentos por backend, 30 chamadas sequenciais por backend em ordem
alternada e 20 chamadas por backend em quatro grupos de cinco concorrentes.
Tempos medidos dentro de uma Edge Function temporária, incluindo HTTP, processamento
e leitura da resposta de cada serviço. Amostra pequena; não é teste de capacidade.

| Região da função | Backend | Média sequencial | Mediana | P95 |
|---|---|---:|---:|---:|
| São Paulo | PostgreSQL | 239,60 ms | 211,63 ms | 498,10 ms |
| São Paulo | Redis | 115,14 ms | 114,11 ms | 118,09 ms |
| Virgínia | PostgreSQL | 77,25 ms | 85,21 ms | 102,77 ms |
| Virgínia | Redis | 2,54 ms | 2,34 ms | 3,97 ms |

São Paulo: redução de 51,95% na média desta etapa, cerca de 124,46 ms por chamada.
Virgínia: redução de 96,71%, cerca de 74,71 ms. O Redis fica em us-east-1; o banco
Supabase foi informado em us-east-2. Não alterar a região da API com base apenas
nessa etapa: a API também autentica e consulta dados no PostgreSQL.

Com cinco chamadas concorrentes, o lote completo de 20 terminou em 1.402,12 ms
no PostgreSQL e 467,10 ms no Redis em São Paulo. Na Virgínia: 371,20 ms e 15,94 ms.
Não representam a capacidade máxima dos serviços.

Sem falhas nas 200 amostras medidas. Em ambas as regiões, teste separado com limite
cinco e dez chamadas simultâneas permitiu cinco e bloqueou cinco. Após expiração
de dois segundos, uma nova chamada foi permitida.

O benefício estrutural é retirar uma gravação do contador no PostgreSQL por
solicitação que usa Redis. Consultas e gravações de negócio continuam existindo.
Não foi medida redução global de CPU, custo ou tempo de carregamento do dashboard.

Resultados brutos: `redis-benchmark-sa-east-1.json` e `redis-benchmark-us-east-1.json`.

A função temporária foi removida. O usuário sintético sem email e sem senha
`bbf9f523-138b-4a9a-9cc0-6ce66b51a039` e seu contador PostgreSQL ainda precisam
ser removidos: a confirmação automática da exclusão expirou nas duas tentativas.
As chaves Redis do teste expiram automaticamente.
