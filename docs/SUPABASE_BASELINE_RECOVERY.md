# Recuperação da baseline do Supabase

## Objetivo e regra de segurança

Produzir uma baseline **somente de schema** que reconstrua o banco do FORJADOS
em PostgreSQL 17, sem exportar dados, usuários, credenciais ou secrets e sem
alterar o projeto de produção. O banco remoto continua sendo a fonte de verdade.

Até a validação completa terminar, não execute:

- `supabase db reset --linked`;
- `supabase db push`;
- `supabase migration repair`;
- exclusão, renomeação ou consolidação das migrations históricas.

Esses comandos podem alterar ou reconstruir o banco vinculado e exigem uma
aprovação separada, depois de existir backup e rollback verificados.

## Inventário verificado em 31/10/2026

O snapshot versionado em `supabase/baseline/production-inventory.json` contém
somente metadados do schema `public`:

| Objeto | Quantidade |
| --- | ---: |
| Tabelas | 56 |
| Tabelas com RLS | 56 |
| Views | 0 |
| Funções | 126 |
| Políticas | 132 |
| Triggers | 88 |

O repositório possui 37 migrations SQL, enquanto o histórico remoto possui 34.
Há 9 correspondências exatas de versão e nome, 28 entradas locais sem par exato
e 25 entradas remotas sem par exato. Essa divergência está registrada em
`supabase/baseline/remote-migrations.json` e é intencionalmente preservada.

Valide os metadados a qualquer momento:

```powershell
npm run supabase:baseline:check
```

## Por que o dump não está versionado ainda

O Supabase CLI executa o `pg_dump` por meio de Docker. O ambiente desta revisão
não possui Docker/Podman nem uma credencial de banco que possa ser usada com
segurança. Um arquivo inventado a partir dos catálogos não substitui um dump
oficial e pode omitir grants, tipos, índices, funções ou detalhes de RLS.

Por isso, o dump real só deve entrar no repositório depois da geração oficial,
validação automatizada e reconstrução limpa descritas abaixo.

## Etapa 1 — gerar um dump temporário no Windows

1. Abra o Docker Desktop e aguarde o mecanismo ficar ativo.
2. Abra o PowerShell na raiz do projeto e confirme a CLI e o vínculo:

```powershell
npx supabase --version
npx supabase projects list
npx supabase migration list --linked
```

3. Gere o arquivo fora do repositório. Não informe senha em chat, commit ou
   captura de tela:

```powershell
$baseline = Join-Path $env:TEMP 'forjados-public-schema.sql'
npx supabase db dump --linked --schema public --file $baseline
```

4. Rode a validação local:

```powershell
npm run supabase:baseline:validate-dump -- $baseline
```

O validador bloqueia `COPY`, `INSERT`, blocos de dados do `pg_dump`, objetos de
`auth`/`storage` e padrões conhecidos de secrets. Ele também exige tabelas do
schema `public` e instruções de RLS.

## Etapa 2 — revisão antes de versionar

Compare o dump com o inventário. Ele precisa representar as 56 tabelas e seus
tipos, sequências, índices, constraints, funções, triggers, grants e políticas.
Revise especialmente funções `SECURITY DEFINER`, `search_path` e privilégios de
`anon`/`authenticated`.

Somente após a revisão copie o arquivo para uma migration de baseline em uma
branch isolada. Não substitua nem apague as 37 migrations existentes nesta
etapa. Rode novamente:

```powershell
npm run check:secrets
npm run supabase:baseline:validate-dump -- <migration-de-baseline.sql>
```

## Etapa 3 — prova de reconstrução local

Com Docker ativo, inicialize o Supabase local e reconstrua **somente o banco
local**. Nunca acrescente `--linked`:

```powershell
npx supabase start
npx supabase db reset --local --no-seed
npx supabase db dump --local --schema public --file "$env:TEMP\forjados-rebuilt-schema.sql"
```

Compare o schema reconstruído com o dump remoto normalizado. Diferenças de
comentários, ownership ou ordenação podem ser ruído; diferenças em tabelas,
tipos, constraints, índices, funções, triggers, grants e políticas bloqueiam a
conclusão.

## Critérios para concluir a Issue #38

- dump oficial somente de schema validado e versionado;
- reconstrução limpa em PostgreSQL 17 concluída sem dados reais;
- inventário reconstruído igual ao remoto nos objetos relevantes;
- `npm run lint`, `npm test`, `npm run build`,
  `npm run check:secrets` e `npm run supabase:baseline:check` aprovados;
- nenhum comando mutável executado no projeto remoto;
- diferenças, riscos e rollback registrados no PR.

## Rollback

Antes de qualquer reparo futuro do histórico remoto, preserve:

1. o dump oficial validado;
2. a lista remota de migrations anterior à mudança;
3. o commit que mantém as migrations históricas;
4. um backup/PITR compatível com o plano do projeto.

Se a reconstrução divergir, interrompa o processo, descarte apenas o banco local
de teste e volte ao inventário e ao dump. Não tente “corrigir” produção com
`db push`, `migration repair` ou `db reset --linked`.

## Riscos fora desta issue

- Os avisos do advisor sobre funções `SECURITY DEFINER` exigem revisão função a
  função e não serão corrigidos na baseline.
- `account_deletion_receipts` e `internal_runtime_secrets` têm RLS sem políticas
  por serem tabelas internas; qualquer mudança exige análise própria.
- A proteção contra senhas vazadas depende do plano do Supabase.
- Índices apenas classificados como não usados não devem ser removidos sem uma
  janela representativa de tráfego e análise de planos de consulta.
