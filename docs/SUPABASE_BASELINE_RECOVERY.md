# Recuperação da baseline do Supabase

## Estado atual

O banco de produção é a fonte de verdade. Em 29/08/2026 ele possui 40 tabelas no
schema `public`, enquanto as migrations históricas deste repositório descrevem
apenas parte da criação inicial. Além disso, os timestamps das migrations antigas
não correspondem aos registrados no projeto remoto.

A migration `20260829141521_performance_hardening.sql` é a primeira migration
local alinhada, por versão e nome, ao histórico remoto nesta revisão.

Até a baseline ser recuperada:

- não execute `supabase db reset` esperando reproduzir produção;
- não execute `supabase db push`;
- não use `supabase migration repair` nas versões históricas;
- aplique DDL somente depois de gerar uma migration explícita e validar no projeto
  correto.

## Por que a recuperação não foi automatizada

O Supabase CLI usa `pg_dump` em um contêiner para exportar o schema vinculado.
Nesta máquina o Docker Desktop não está instalado. Alterar o histórico remoto sem
um dump completo e validado poderia produzir uma baseline incompleta.

## Procedimento seguro

1. Instale/inicie o Docker Desktop e confirme que o daemon está saudável.
2. Confirme o projeto vinculado com `npx supabase projects list` e
   `npx supabase migration list --linked`.
3. Gere um dump somente de schema em um arquivo temporário com
   `npx supabase db dump --linked --schema public --file <arquivo-temporario>`.
4. Revise o dump: ele não deve conter dados, credenciais ou objetos de outros
   projetos. Confirme as 40 tabelas, políticas RLS, funções, gatilhos, grants,
   índices e tipos usados pelo aplicativo.
5. Em uma branch dedicada, arquive as migrations parciais e transforme o dump
   validado em uma única migration de baseline.
6. Suba o Supabase local e execute `npx supabase db reset`. Compare o schema
   local resultante com produção antes de tocar no histórico remoto.
7. Somente depois dessa comparação, repare o histórico remoto para representar a
   baseline consolidada. Faça essa etapa em uma janela controlada e registre as
   versões alteradas.

## Riscos aceitos e pendências

- A proteção contra senhas vazadas do Supabase não está disponível no plano
  atual. O aviso permanece aceito até uma eventual mudança de plano.
- Funções `security definer` executáveis pelo papel `authenticated` foram
  revisadas: possuem `search_path` fixo e verificações de usuário/papel; nenhuma
  está executável por `anon`. O novo aviso do advisor deve ser tratado
  função por função, com testes de autorização, e não por revogação em massa.
- Políticas permissivas duplicadas e índices classificados como não usados devem
  ser consolidados apenas após medir tráfego e validar a equivalência das regras.
- A manutenção de bloat em `net._http_response` exige janela de manutenção; não
  execute `VACUUM FULL` durante operação normal.
