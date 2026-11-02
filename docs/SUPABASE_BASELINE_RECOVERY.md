# Recuperação da baseline do Supabase

## Objetivo e regra de segurança

Manter uma baseline **somente de schema** que reconstrua o banco do FORJADOS
em PostgreSQL 17, sem exportar dados, usuários, credenciais ou secrets e sem
alterar o projeto de produção. O banco remoto continua sendo a fonte de verdade.

A baseline oficial está em
`supabase/baseline/production-schema.sql` e inclui os schemas `public` e
`private`. O schema `private` é necessário porque gatilhos de tabelas públicas
chamam funções privadas.

Não execute sem aprovação específica, backup e rollback verificados:

- `supabase db reset --remote` ou o antigo `--linked`;
- `supabase db push`;
- `supabase migration repair`;
- exclusão, renomeação ou consolidação das migrations históricas.

## Inventário verificado

O snapshot em `supabase/baseline/production-inventory.json` registra somente
metadados do schema `public`:

| Objeto | Quantidade |
| --- | ---: |
| Tabelas | 56 |
| Tabelas com RLS | 56 |
| Views | 0 |
| Funções | 126 |
| Políticas | 132 |
| Triggers em `information_schema.triggers` | 88 |

O repositório possui 37 migrations SQL, enquanto o histórico remoto possui 34.
Há 9 correspondências exatas de versão e nome, 28 entradas locais sem par exato
e 25 entradas remotas sem par exato. Essa divergência está preservada em
`supabase/baseline/remote-migrations.json`.

Valide metadados e o dump versionado com:

```powershell
npm run supabase:baseline:check
```

## Gerar novamente a baseline no Windows

1. Abra o Docker Desktop e aguarde o mecanismo ficar ativo.
2. Na raiz do projeto, confirme a CLI, o projeto e o histórico remoto:

```powershell
npx supabase --version
npx supabase projects list
npx supabase migration list --remote
```

3. Gere o arquivo fora do repositório. Não informe senha em chat, commit ou
captura de tela:

```powershell
$baseline = Join-Path $env:TEMP 'forjados-public-private-schema.sql'
npx supabase db dump --remote --schema "public,private" --file $baseline
```

4. Valide antes de copiar ou versionar:

```powershell
npm run supabase:baseline:validate-dump -- $baseline
npm run check:secrets
```

O validador bloqueia `COPY`, `INSERT`, blocos de dados do `pg_dump`,
objetos exportados de `auth`/`storage` e padrões conhecidos de secrets. Ele
também exige exatamente as 56 tabelas públicas inventariadas e instruções de
RLS.

## Prova de reconstrução isolada

Não coloque a baseline como primeira migration do histórico atual: as 37
migrations locais divergentes são preservadas para investigação e não formam,
sozinhas, uma cadeia reproduzível.

Crie um projeto Supabase temporário contendo somente a baseline:

```powershell
$testRoot = Join-Path $env:TEMP ("forjados-baseline-test-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $testRoot | Out-Null
Set-Location $testRoot
npx supabase init
New-Item -ItemType Directory -Force ".\supabase\migrations" | Out-Null
Copy-Item "$env:TEMP\forjados-public-private-schema.sql" ".\supabase\migrations\20261102120500_production_baseline.sql"
npx supabase start
npx supabase db reset --local --no-seed
npx supabase db dump --schema "public,private" --file "$env:TEMP\forjados-rebuilt-schema.sql"
```

Compare os objetos reconstruídos com o inventário remoto. Diferenças textuais
de comentários, ownership, ACL padrão ou ordenação podem ser ruído; diferenças
em tabelas, tipos, constraints, índices, funções, gatilhos, grants ou políticas
bloqueiam a conclusão.

Ao terminar:

```powershell
npx supabase stop
```

## Evidência da reconstrução de 02/11/2026

A tentativa com as migrations históricas falhou porque a primeira migration
referenciava `public.profiles` antes da criação da tabela. Nenhum comando
mutável foi executado no projeto remoto.

O primeiro dump apenas de `public` revelou uma dependência real em
`private.forjados_prepare_trail_group_traffic_v1`. O dump final de `public` e
`private` foi validado, aplicado em uma instância Supabase local vazia e
reaplicado por `db reset --local --no-seed`.

O banco reconstruído apresentou:

| Objeto | Reconstruído | Inventário remoto |
| --- | ---: | ---: |
| Tabelas públicas | 56 | 56 |
| Tabelas públicas com RLS | 56 | 56 |
| Funções públicas | 126 | 126 |
| Políticas públicas | 132 | 132 |
| Triggers públicos | 88 | 88 |
| Views públicas | 0 | 0 |
| Funções privadas necessárias | 31 | — |

Os hashes dos dumps bruto e reconstruído diferem por normalização do PostgreSQL
local e ACLs padrão. Por isso, a validação conclusiva foi feita pelos objetos do
catálogo, não por igualdade byte a byte.

## Critérios para concluir a Issue #38

- dump oficial somente de schema validado e versionado;
- reconstrução limpa em PostgreSQL 17 concluída sem dados reais;
- inventário reconstruído igual ao remoto nos objetos relevantes;
- `npm run lint`, `npm test`, `npm run build`,
  `npm run check:secrets` e `npm run supabase:baseline:check` aprovados;
- nenhum comando mutável executado no projeto remoto;
- diferenças, riscos e rollback registrados na PR.

## Rollback

Antes de qualquer reparo futuro do histórico remoto, preserve:

1. a baseline oficial validada;
2. a lista remota de migrations anterior à mudança;
3. o commit que mantém as migrations históricas;
4. um backup/PITR compatível com o plano do projeto.

Se a reconstrução divergir, interrompa o processo, pare apenas o Supabase local
de teste e volte ao inventário e ao dump. Não tente corrigir produção com
`db push`, `migration repair` ou `db reset --remote`.

## Riscos fora desta issue

- Os avisos do advisor sobre funções `SECURITY DEFINER` exigem revisão função a
  função e não são corrigidos pela baseline.
- `account_deletion_receipts` e `internal_runtime_secrets` têm RLS sem
  políticas por serem tabelas internas; qualquer mudança exige análise própria.
- A proteção contra senhas vazadas depende do plano do Supabase.
- Índices classificados como não usados não devem ser removidos sem uma janela
  representativa de tráfego e análise de planos de consulta.
