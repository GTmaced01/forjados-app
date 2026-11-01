import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const INVENTORY_PATH = resolve(ROOT, 'supabase/baseline/production-inventory.json');
const REMOTE_MIGRATIONS_PATH = resolve(ROOT, 'supabase/baseline/remote-migrations.json');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');

const SECRET_PATTERNS = [
  /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/i,
  /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
  /\b(?:service_role|SUPABASE_DB_PASSWORD)\s*[=:]\s*\S+/i,
  /\bpostgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
];

const DATA_STATEMENTS = [
  { label: 'COPY com dados', regex: /^COPY\s+[^\n]+\s+FROM\s+stdin;/im },
  { label: 'INSERT de dados', regex: /^INSERT\s+INTO\s+/im },
  { label: 'bloco de dados do pg_dump', regex: /^-- Data for Name:/im },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fail(message) {
  throw new Error(message);
}

export function validateMetadata({ inventory, remoteMigrations, localFiles }) {
  if (inventory.schema !== 'public') fail('O inventário deve registrar apenas o schema public.');
  if (!/^\d+\.\d+$/.test(inventory.postgres_version)) fail('Versão do PostgreSQL inválida.');
  if (!Array.isArray(inventory.table_names)) fail('Lista de tabelas ausente.');
  const sortedTables = [...inventory.table_names].sort();
  if (new Set(sortedTables).size !== sortedTables.length) fail('O inventário contém tabelas duplicadas.');
  if (JSON.stringify(sortedTables) !== JSON.stringify(inventory.table_names)) fail('As tabelas devem estar ordenadas.');
  if (inventory.counts.tables !== sortedTables.length) fail('A contagem de tabelas não corresponde à lista.');
  if (inventory.counts.rls_tables !== inventory.counts.tables) fail('Nem todas as tabelas registradas têm RLS.');
  if ('rows' in inventory || JSON.stringify(inventory).includes('row_count')) fail('O inventário não pode conter contagens ou dados de linhas.');

  const remote = remoteMigrations.migrations;
  if (!Array.isArray(remote) || remote.length === 0) fail('Histórico remoto ausente.');
  const remoteKeys = remote.map(({ version, name }) => `${version}_${name}.sql`);
  if (remote.some(({ version, name }) => !/^\d{14}$/.test(version) || !/^[a-z0-9_]+$/.test(name))) {
    fail('Histórico remoto contém versão ou nome inválido.');
  }
  if (new Set(remoteKeys).size !== remoteKeys.length) fail('Histórico remoto contém duplicatas.');

  const local = localFiles.filter((file) => file.endsWith('.sql')).sort();
  if (local.some((file) => !/^\d{8,14}_[a-z0-9_]+\.sql$/.test(file))) fail('Migration local com nome inválido.');
  const exactMatches = local.filter((file) => remoteKeys.includes(file));

  const serialized = JSON.stringify({ inventory, remoteMigrations });
  if (SECRET_PATTERNS.some((pattern) => pattern.test(serialized))) fail('Possível secret encontrado nos metadados.');
  return {
    local: local.length,
    remote: remote.length,
    exactMatches: exactMatches.length,
    divergentLocal: local.length - exactMatches.length,
    divergentRemote: remote.length - exactMatches.length,
  };
}

export function validateSchemaDump(contents, inventory) {
  if (SECRET_PATTERNS.some((pattern) => pattern.test(contents))) fail('Possível secret encontrado no dump.');
  for (const { label, regex } of DATA_STATEMENTS) {
    if (regex.test(contents)) fail(`${label} encontrado; gere novamente somente com schema.`);
  }
  if (/\bCREATE\s+(?:TABLE|VIEW|FUNCTION|TYPE|SEQUENCE)\s+(?:IF NOT EXISTS\s+)?"?(?:auth|storage)"?\./i.test(contents)) {
    fail('O dump tenta criar objetos fora do schema public.');
  }
  if (!/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"?public"?\.)/i.test(contents)) {
    fail('O dump não contém tabelas do schema public.');
  }
  if (!/ENABLE ROW LEVEL SECURITY/i.test(contents)) fail('O dump não registra RLS.');
  if (inventory) {
    const createdTables = [...contents.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?public"?\."?([a-z0-9_]+)"?/gi)]
      .map((match) => match[1])
      .sort();
    if (JSON.stringify(createdTables) !== JSON.stringify(inventory.table_names)) {
      fail(`O dump não representa exatamente as ${inventory.counts.tables} tabelas inventariadas.`);
    }
  }
  return true;
}

export function loadAndValidateMetadata() {
  return validateMetadata({
    inventory: readJson(INVENTORY_PATH),
    remoteMigrations: readJson(REMOTE_MIGRATIONS_PATH),
    localFiles: readdirSync(MIGRATIONS_DIR),
  });
}

function runCli(argv) {
  if (argv.includes('--metadata')) {
    const result = loadAndValidateMetadata();
    console.log(`Baseline metadata OK: ${result.local} locais, ${result.remote} remotas, ${result.exactMatches} correspondências exatas.`);
    return;
  }
  const dumpIndex = argv.indexOf('--dump');
  const path = dumpIndex >= 0 ? argv[dumpIndex + 1] : undefined;
  if (!path) fail('Uso: npm run supabase:baseline:validate-dump -- <caminho-do-dump.sql>');
  const absolutePath = resolve(process.cwd(), path);
  if (!existsSync(absolutePath)) fail(`Dump não encontrado: ${basename(path)}`);
  validateSchemaDump(readFileSync(absolutePath, 'utf8'), readJson(INVENTORY_PATH));
  console.log(`Dump schema-only validado: ${basename(path)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
