import { createClient } from '@supabase/supabase-js';
import { isPasswordRecoveryUrl } from './authRecovery';

// O fluxo implícito do Supabase consome e pode remover o hash da URL durante a
// criação do client. Capturamos o callback antes disso para não perder o evento
// de recuperação em carregamentos rápidos, PWA ou navegadores mobile.
export const initialPasswordRecovery =
  typeof window !== 'undefined' && isPasswordRecoveryUrl(window.location);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase não configurado. Confira o arquivo .env.');
}

const supabaseClient = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Mantemos o client com tipagem leve para evitar travamentos do TypeScript em builders complexos do Supabase.
// As funções de serviço continuam tipando os retornos manualmente com os tipos do app.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = supabaseClient;
