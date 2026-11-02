import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

const PLACEHOLDER_PATTERN = /^(?:SUA_|SEU-|YOUR_|CHANGE[_-]?ME)/i;

export function validateViteEnv(env) {
  const errors = [];
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim() ?? '';
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

  if (!supabaseUrl || PLACEHOLDER_PATTERN.test(supabaseUrl)) {
    errors.push('VITE_SUPABASE_URL não está configurada.');
  } else {
    try {
      const parsedUrl = new URL(supabaseUrl);
      if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('.supabase.co')) {
        errors.push('VITE_SUPABASE_URL precisa ser uma URL HTTPS válida do Supabase.');
      }
    } catch {
      errors.push('VITE_SUPABASE_URL precisa ser uma URL válida.');
    }
  }

  if (!supabaseKey || PLACEHOLDER_PATTERN.test(supabaseKey)) {
    errors.push('VITE_SUPABASE_ANON_KEY não está configurada.');
  } else if (/^(?:sb_secret_|service_role)/i.test(supabaseKey)) {
    errors.push('VITE_SUPABASE_ANON_KEY não pode conter uma chave secret ou service_role.');
  } else if (!/^(?:sb_publishable_|eyJ)/.test(supabaseKey)) {
    errors.push('VITE_SUPABASE_ANON_KEY precisa conter uma chave publishable ou anon válida.');
  }

  return errors;
}

export function checkViteEnv() {
  const env = loadEnv('production', process.cwd(), '');
  const errors = validateViteEnv(env);

  if (errors.length > 0) {
    console.error('ERRO: configuração pública do Supabase inválida:');
    for (const error of errors) console.error(`- ${error}`);
    console.error('Crie um .env.local com a Project URL e uma chave publishable/anon antes do build.');
    return false;
  }

  console.log('Configuração pública do Supabase validada para o build.');
  return true;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule && !checkViteEnv()) process.exitCode = 1;
