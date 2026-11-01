import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadAndValidateMetadata,
  validateMetadata,
  validateSchemaDump,
} from '../scripts/validate-supabase-baseline.mjs';

test('valida o inventário versionado e registra a divergência sem apagar histórico', () => {
  assert.deepEqual(loadAndValidateMetadata(), {
    local: 37,
    remote: 34,
    exactMatches: 9,
    divergentLocal: 28,
    divergentRemote: 25,
  });
});

test('aceita dump somente de schema público com RLS', () => {
  assert.equal(validateSchemaDump(`
    CREATE TABLE public.example (id uuid primary key);
    ALTER TABLE public.example ENABLE ROW LEVEL SECURITY;
  `), true);
});

test('rejeita dados, objetos externos e secrets em dumps', () => {
  const invalid = [
    'CREATE TABLE public.example(id int); COPY public.example FROM stdin;',
    'CREATE TABLE public.example(id int); INSERT INTO public.example VALUES (1);',
    'CREATE TABLE public.example(id int); CREATE TABLE auth.users(id int);',
    'CREATE TABLE public.example(id int); service_role=not-allowed-in-baseline',
  ];
  for (const sql of invalid) assert.throws(() => validateSchemaDump(sql));
});

test('permite referência a auth.users sem exportar a tabela de autenticação', () => {
  assert.equal(validateSchemaDump(`
    CREATE TABLE public.example (user_id uuid references auth.users(id));
    ALTER TABLE public.example ENABLE ROW LEVEL SECURITY;
  `), true);
});

test('rejeita inventário inconsistente ou contendo contagem de linhas', () => {
  const base = {
    schema: 'public',
    postgres_version: '17.6',
    counts: { tables: 1, rls_tables: 1 },
    table_names: ['example'],
  };
  const history = { migrations: [{ version: '20260101000000', name: 'initial' }] };
  assert.throws(() => validateMetadata({ inventory: { ...base, rows: 1 }, remoteMigrations: history, localFiles: ['20260101000000_initial.sql'] }));
  assert.throws(() => validateMetadata({ inventory: { ...base, counts: { tables: 2, rls_tables: 1 } }, remoteMigrations: history, localFiles: ['20260101000000_initial.sql'] }));
});
