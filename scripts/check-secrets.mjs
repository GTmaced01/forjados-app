import { existsSync, readFileSync } from 'node:fs';
import { extname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
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

const findings = [];
let files;
try {
  files = execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0').filter(Boolean);
} catch {
  console.error('Não foi possível listar os arquivos versionados com Git.');
  process.exit(1);
}

for (const file of files) {
  if (/\.(jks|keystore|p12|pfx)$/i.test(file) ||
      (/^keystore\.properties(?:\..*)?$/i.test(basename(file)) && basename(file) !== 'keystore.properties.example')) {
    findings.push(`${file}: arquivo privado de assinatura`);
    continue;
  }
  if (!existsSync(file) || !TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
  const contents = readFileSync(file, 'utf8');

  if (/\.properties(?:\.example)?$/i.test(file) && /^[\t ]*(?:storePassword|keyPassword)[\t ]*[=:][\t ]*\S/m.test(contents)) {
    findings.push(`${file}: senha de assinatura preenchida`);
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(contents)) findings.push(`${file}: ${pattern.name}`);
  }
}

if (findings.length > 0) {
  console.error('Possíveis secrets versionados:\n' + findings.map((finding) => `- ${finding}`).join('\n'));
  process.exit(1);
}

console.log('Nenhum secret conhecido foi encontrado nos arquivos versionados.');
