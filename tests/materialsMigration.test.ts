import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261030221244_materials_inventory.sql', import.meta.url),
  'utf8',
);

test('protege as três tabelas de materiais com RLS e privilégios explícitos', () => {
  for (const table of ['material_items', 'material_movements', 'material_item_history']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.match(migration, /grant select, insert, update on table public\.material_items to authenticated/i);
  assert.match(migration, /grant select on table public\.material_movements to authenticated/i);
  assert.doesNotMatch(migration, /grant[^;]*insert[^;]*material_movements[^;]*authenticated/i);
});

test('restringe líderes à liderança real do setor na edição ativa', () => {
  assert.match(migration, /assignment\.is_leader is true/i);
  assert.match(migration, /assignment\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /unit\.unit_type = 'sector'/i);
  assert.match(migration, /edition\.is_active is true/i);
});

test('mantém movimentação atômica e bloqueia estoque negativo', () => {
  assert.match(migration, /for update/i);
  assert.match(migration, /v_result < 0/i);
  assert.match(migration, /insert into public\.material_movements/i);
  assert.match(migration, /update public\.material_items/i);
  assert.match(migration, /Altere a quantidade por meio de uma movimentação/i);
});

test('configura armazenamento privado com limite e formatos aprovados', () => {
  assert.match(migration, /'material-images'[\s\S]*false,[\s\S]*5242880/i);
  assert.match(migration, /image\/jpeg/i);
  assert.match(migration, /image\/png/i);
  assert.match(migration, /image\/webp/i);
  for (const operation of ['select', 'insert', 'update', 'delete']) {
    assert.match(migration, new RegExp(`create policy material_images_${operation}_managers`, 'i'));
  }
});
