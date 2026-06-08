import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { AuditLog } from '../types';

const TIMEOUT = 10000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeRequest<T = any>(request: PromiseLike<T>, errorMessage: string): Promise<T> {
  return withTimeout(Promise.resolve(request), TIMEOUT, errorMessage);
}

function friendly(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message) return error;
  return new Error(fallback, { cause: error });
}

export async function listAuditLogs(): Promise<AuditLog[]> {
  try {
    const { data, error } = await safeRequest(
      supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150),
      'Não foi possível carregar o histórico do sistema.'
    );

    if (error) throw error;
    return (data || []) as AuditLog[];
  } catch (error) {
    throw friendly(error, 'Erro ao carregar histórico do sistema.');
  }
}

export function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    profile_approved: 'Membro aprovado',
    profile_rejected: 'Membro recusado',
    points_inserted: 'Pontos lançados',
    payment_reviewed: 'Pagamento analisado',
    public_panel_created: 'Aviso criado',
    public_panel_updated: 'Aviso atualizado',
    shirt_updated: 'Camisa atualizada',
    shirt_deleted: 'Camisa excluída/ocultada',
    product_updated: 'Produto atualizado',
    product_deleted: 'Produto excluído/ocultado',
  };

  return labels[action] || action;
}
