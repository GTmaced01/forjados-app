import { supabase } from './supabase';

export type AdminHistoryEntity =
  | 'rides'
  | 'points_redemptions'
  | 'point_transactions'
  | 'shirt_orders'
  | 'public_panel_items'
  | 'offers'
  | 'payment_receipts'
  | 'service_scale_schedules'
  | 'automated_messages';

export async function softDeleteAdminHistory(params: {
  entityType: AdminHistoryEntity;
  entityId: string;
  reason: string;
}): Promise<void> {
  const reason = params.reason.trim();

  if (reason.length < 3) {
    throw new Error('Informe um motivo com pelo menos 3 caracteres.');
  }

  if (reason.length > 500) {
    throw new Error('O motivo deve ter no máximo 500 caracteres.');
  }

  const { error } = await supabase.rpc('forjados_admin_soft_delete_record_v1', {
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_reason: reason,
  });

  if (error) {
    throw new Error(error.message || 'Não foi possível excluir o histórico.');
  }
}
