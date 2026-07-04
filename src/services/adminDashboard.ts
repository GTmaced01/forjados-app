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
  total_members: number;
  pending_members: number;
  rejected_members: number;
  leaders_count: number;
  directors_count: number;
  treasury_count: number;
  active_shirts: number;
  total_shirt_orders: number;
  active_points_products: number;
  total_points_redemptions: number;
  pending_offers: number;
  approved_offers: number;
  total_offers_amount: number;
  approved_offers_amount: number;
  total_inscription_receipts_amount: number;
  active_automated_messages: number;
  published_service_schedules: number;
  active_retreats: number;
}

const EMPTY_SUMMARY: AdminDashboardSummary = {
  pending_access_requests: 0,
  pending_payment_receipts: 0,
  pending_shirt_orders: 0,
  pending_points_redemptions: 0,
  open_rides: 0,
  active_public_panel_items: 0,
  approved_members: 0,
  total_members: 0,
  pending_members: 0,
  rejected_members: 0,
  leaders_count: 0,
  directors_count: 0,
  treasury_count: 0,
  active_shirts: 0,
  total_shirt_orders: 0,
  active_points_products: 0,
  total_points_redemptions: 0,
  pending_offers: 0,
  approved_offers: 0,
  total_offers_amount: 0,
  approved_offers_amount: 0,
  total_inscription_receipts_amount: 0,
  active_automated_messages: 0,
  published_service_schedules: 0,
  active_retreats: 0,
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
      total_members: Number(row?.total_members || 0),
      pending_members: Number(row?.pending_members || 0),
      rejected_members: Number(row?.rejected_members || 0),
      leaders_count: Number(row?.leaders_count || 0),
      directors_count: Number(row?.directors_count || 0),
      treasury_count: Number(row?.treasury_count || 0),
      active_shirts: Number(row?.active_shirts || 0),
      total_shirt_orders: Number(row?.total_shirt_orders || 0),
      active_points_products: Number(row?.active_points_products || 0),
      total_points_redemptions: Number(row?.total_points_redemptions || 0),
      pending_offers: Number(row?.pending_offers || 0),
      approved_offers: Number(row?.approved_offers || 0),
      total_offers_amount: Number(row?.total_offers_amount || 0),
      approved_offers_amount: Number(row?.approved_offers_amount || 0),
      total_inscription_receipts_amount: Number(row?.total_inscription_receipts_amount || 0),
      active_automated_messages: Number(row?.active_automated_messages || 0),
      published_service_schedules: Number(row?.published_service_schedules || 0),
      active_retreats: Number(row?.active_retreats || 0),
    };
  } catch (error) {
    console.warn('Resumo do painel indisponível:', error);
    return EMPTY_SUMMARY;
  }
}
