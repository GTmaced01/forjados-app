-- FORJADOS ADMIN 2.0
-- Dashboard Inteligente: resumo executivo com indicadores para admin/diretor.
-- Rode este arquivo no SQL Editor do Supabase antes ou depois de publicar o front-end.

begin;

create or replace function public.forjados_is_admin_or_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        coalesce(p.is_admin, false) = true
        or p.role in ('admin', 'director')
      )
  );
$$;

drop function if exists public.admin_get_dashboard_summary();

create function public.admin_get_dashboard_summary()
returns table (
  pending_access_requests bigint,
  pending_payment_receipts bigint,
  pending_shirt_orders bigint,
  pending_points_redemptions bigint,
  open_rides bigint,
  active_public_panel_items bigint,
  approved_members bigint,
  total_members bigint,
  pending_members bigint,
  rejected_members bigint,
  leaders_count bigint,
  directors_count bigint,
  treasury_count bigint,
  active_shirts bigint,
  total_shirt_orders bigint,
  active_points_products bigint,
  total_points_redemptions bigint,
  pending_offers bigint,
  approved_offers bigint,
  total_offers_amount numeric,
  approved_offers_amount numeric,
  total_inscription_receipts_amount numeric,
  active_automated_messages bigint,
  published_service_schedules bigint,
  active_retreats bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.forjados_is_admin_or_director() then
    raise exception 'Sem permissão para acessar o dashboard administrativo.';
  end if;

  return query
  select
    (select count(*) from public.profiles p where p.inscription_status = 'pending') as pending_access_requests,
    (select count(*) from public.payment_receipts pr where pr.status = 'pending') as pending_payment_receipts,
    (select count(*) from public.shirt_orders so where so.status in ('waiting_payment', 'receipt_sent')) as pending_shirt_orders,
    (select count(*) from public.points_redemptions r where r.status = 'pending') as pending_points_redemptions,
    (select count(*) from public.rides r where r.status = 'available') as open_rides,
    (select count(*) from public.public_panel_items i where i.is_active = true) as active_public_panel_items,
    (select count(*) from public.profiles p where p.inscription_status = 'approved' and coalesce(p.is_deleted, false) = false) as approved_members,
    (select count(*) from public.profiles p where coalesce(p.is_deleted, false) = false) as total_members,
    (select count(*) from public.profiles p where p.inscription_status = 'pending' and coalesce(p.is_deleted, false) = false) as pending_members,
    (select count(*) from public.profiles p where p.inscription_status = 'rejected' and coalesce(p.is_deleted, false) = false) as rejected_members,
    (select count(*) from public.profiles p where p.role = 'leader' and coalesce(p.is_deleted, false) = false) as leaders_count,
    (select count(*) from public.profiles p where p.role = 'director' and coalesce(p.is_deleted, false) = false) as directors_count,
    (select count(*) from public.profiles p where p.role = 'treasury' and coalesce(p.is_deleted, false) = false) as treasury_count,
    (select count(*) from public.shirts s where s.is_active = true) as active_shirts,
    (select count(*) from public.shirt_orders so) as total_shirt_orders,
    (select count(*) from public.points_store_products p where p.is_active = true) as active_points_products,
    (select count(*) from public.points_redemptions r) as total_points_redemptions,
    (select count(*) from public.offers o where o.status = 'pending') as pending_offers,
    (select count(*) from public.offers o where o.status = 'approved') as approved_offers,
    coalesce((select sum(o.amount) from public.offers o), 0)::numeric as total_offers_amount,
    coalesce((select sum(o.amount) from public.offers o where o.status = 'approved'), 0)::numeric as approved_offers_amount,
    coalesce((select sum(pr.amount) from public.payment_receipts pr where pr.status = 'approved' and pr.type = 'inscription'), 0)::numeric as total_inscription_receipts_amount,
    (select count(*) from public.automated_messages m where m.status = 'scheduled') as active_automated_messages,
    (select count(*) from public.service_scale_schedules s where s.status = 'published') as published_service_schedules,
    (select count(*) from public.retreat_events e where e.active = true) as active_retreats;
end;
$$;

grant execute on function public.admin_get_dashboard_summary() to authenticated;
grant execute on function public.forjados_is_admin_or_director() to authenticated;

commit;
