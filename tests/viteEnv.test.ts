import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateViteEnv } from '../scripts/check-vite-env.mjs';

const validEnv = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_example_public_key',
};

test('aceita URL do Supabase e chave publicável', () => {
  assert.deepEqual(validateViteEnv(validEnv), []);
});

test('aceita chave anon legada para compatibilidade', () => {
  assert.deepEqual(validateViteEnv({
    ...validEnv,
    VITE_SUPABASE_ANON_KEY: 'eyJlegacyAnonKey',
  }), []);
});

test('rejeita configuração ausente, placeholders e chaves privilegiadas', () => {
  assert.ok(validateViteEnv({}).length >= 2);
  assert.ok(validateViteEnv({
    VITE_SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'SUA_CHAVE_PUBLICA',
  }).length >= 2);
  assert.ok(validateViteEnv({
    ...validEnv,
    VITE_SUPABASE_ANON_KEY: 'sb_secret_never_ship_this',
  }).some((error) => error.includes('secret')));
});

test('o build principal valida o ambiente antes do Vite', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(packageJson.scripts.build, /^node scripts\/check-vite-env\.mjs && /);
});

test('a atualização Android usa versionCode 2 e versionName 1.0.1', () => {
  const gradle = readFileSync('android/app/build.gradle', 'utf8');
  assert.match(gradle, /versionCode 2/);
  assert.match(gradle, /versionName "1\.0\.1"/);
});
