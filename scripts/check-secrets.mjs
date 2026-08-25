import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const IGNORED_DIRECTORIES = new Set(['.git', '.npm-cache', 'dist', 'node_modules']);
const TEXT_EXTENSIONS = new Set([
  '', '.css', '.env', '.example', '.gradle', '.html', '.java', '.js', '.json', '.jsx',
  '.md', '.mjs', '.plist', '.properties', '.sql', '.svg', '.swift', '.toml', '.ts',
  '.tsx', '.txt', '.webmanifest', '.xml', '.yaml', '.yml',
]);
const SECRET_PATTERNS = [
  { name: 'chave privada PEM', regex: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/ },
  { name: 'Supabase secret key', regex: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
  { name: 'token secreto de pagamento', regex: /\b(?:sk_live_|APP_USR-)[A-Za-z0-9_-]{20,}\b/ },
  { name: 'JWT hardcoded', regex: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
];

function listFilesRecursively(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    if (IGNORED_DIRECTORIES.has(entry)) continue;
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) files.push(...listFilesRecursively(fullPath));
    else files.push(relative(ROOT, fullPath));
  }

  return files;
}

const findings = [];

for (const file of listFilesRecursively(ROOT)) {
  if (!existsSync(file) || !TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
  const contents = readFileSync(file, 'utf8');

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(contents)) findings.push(`${file}: ${pattern.name}`);
  }
}

if (findings.length > 0) {
  console.error('Possíveis secrets versionados:\n' + findings.map((finding) => `- ${finding}`).join('\n'));
  process.exit(1);
}

console.log('Nenhum secret conhecido foi encontrado nos arquivos versionados.');
