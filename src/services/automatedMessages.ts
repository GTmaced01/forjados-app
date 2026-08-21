import { supabase } from './supabase';
import type { AutomatedMessage, AutomatedMessageTarget } from '../types';

export async function listAutomatedMessages(): Promise<AutomatedMessage[]> {
  const { data, error } = await supabase
    .from('automated_messages')
    .select('*')
    .order('scheduled_at', { ascending: false });

  if (error) throw error;
  return (data || []) as AutomatedMessage[];
}

export async function createAutomatedMessage(params: {
  title: string;
  message: string;
  target: AutomatedMessageTarget;
  target_team?: string;
  scheduled_at: string;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  // O input datetime-local entrega o horário no fuso local do navegador, sem timezone.
  // Enviar esse valor cru para uma coluna timestamptz faz o PostgreSQL tratar como UTC,
  // causando diferença de 3 horas no Brasil. Convertemos para ISO UTC antes de salvar.
  const scheduledAt = new Date(params.scheduled_at);

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error('Data/hora inválida. Selecione novamente o horário da mensagem.');
  }

  const { error } = await supabase.from('automated_messages').insert({
    title: params.title,
    message: params.message,
    target: params.target,
    target_team: params.target_team || null,
    scheduled_at: scheduledAt.toISOString(),
    status: 'scheduled',
    created_by: userData.user?.id || null,
  });

  if (error) throw error;
}

export async function cancelAutomatedMessage(messageId: string) {
  const { error } = await supabase
    .from('automated_messages')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', messageId);

  if (error) throw error;
}

// Scheduled messages are processed exclusively by pg_cron. Keeping this function as a
// compatibility no-op avoids a breaking Dashboard refactor while removing a privileged
// database action from ordinary browser sessions.
export async function processDueAutomatedMessages() {
  return {
    ok: true,
    processed_messages: 0,
    created_notifications: 0,
    source: 'pg_cron',
  };
}

export async function getAutomatedMessagesCronStatus() {
  const { data, error } = await supabase.rpc('forjados_automated_messages_cron_status');
  if (error) throw error;
  return data as {
    mode?: string;
    job_name?: string;
    job_exists?: boolean;
    active?: boolean;
    job_id?: number | null;
    frequency?: string;
    checked_at?: string;
  } | null;
}
