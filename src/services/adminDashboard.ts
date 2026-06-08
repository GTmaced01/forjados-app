import { supabase } from './supabase';
import { withTimeout } from './safeAsync';

export interface AdminDashboardSummary {
  pending_access_requests: number;
  pending_payment_receipts: number;
  pending_shirt_orders: number;
  pending_points_redemptions: number;
  open_rides: number;
  active_public_panel_items: number;
  approved_members: number;
}

const EMPTY_SUMMARY: AdminDashboardSummary = {
  pending_access_requests: 0,
  pending_payment_receipts: 0,
  pending_shirt_orders: 0,
  pending_points_redemptions: 0,
  open_rides: 0,
  active_public_panel_items: 0,
  approved_members: 0,
};

type SupabaseResponse = {
  data?: Record<string, unknown> | Record<string, unknown>[] | null;
  error?: Error | null;
};

export async function getAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  try {
    const response = (await withTimeout(
      Promise.resolve(supabase.rpc('admin_get_dashboard_summary')),
      10000,
      'Não foi possível carregar o resumo do painel.'
    )) as SupabaseResponse;

    if (response.error) throw response.error;

    const row = Array.isArray(response.data) ? response.data[0] : response.data;

    return {
      pending_access_requests: Number(row?.pending_access_requests || 0),
      pending_payment_receipts: Number(row?.pending_payment_receipts || 0),
      pending_shirt_orders: Number(row?.pending_shirt_orders || 0),
      pending_points_redemptions: Number(row?.pending_points_redemptions || 0),
      open_rides: Number(row?.open_rides || 0),
      active_public_panel_items: Number(row?.active_public_panel_items || 0),
      approved_members: Number(row?.approved_members || 0),
    };
  } catch (error) {
    console.warn('Resumo do painel indisponível:', error);
    return EMPTY_SUMMARY;
  }
}
