import { clearSensitiveLocalData } from './localData';
import { supabase } from './supabase';

export type AccountDeletionResult = {
  deleted: boolean;
  receiptId?: string;
  message?: string;
};

export async function deleteMyAccount(confirmation: string): Promise<AccountDeletionResult> {
  if (confirmation !== 'EXCLUIR') {
    throw new Error('Digite EXCLUIR para confirmar.');
  }

  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { confirmation },
  });

  if (error) {
    const context = error.context as Response | undefined;
    if (context && typeof context.json === 'function') {
      const responseBody = await context.json().catch(() => null) as { error?: string } | null;
      if (responseBody?.error) throw new Error(responseBody.error);
    }
    throw error;
  }

  const result = (data || {}) as AccountDeletionResult & { error?: string };
  if (result.error) throw new Error(result.error);
  if (!result.deleted) throw new Error('O serviço não confirmou a exclusão da conta.');

  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // A conta já foi removida no servidor; a limpeza local abaixo é suficiente.
  } finally {
    clearSensitiveLocalData();
  }

  return result;
}
