begin;

alter table public.service_scale_schedules
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists delete_reason text;

alter table public.automated_messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists delete_reason text;

create index if not exists rides_active_created_idx
  on public.rides (created_at desc) where deleted_at is null;
create index if not exists points_redemptions_active_created_idx
  on public.points_redemptions (created_at desc) where deleted_at is null;
create index if not exists point_transactions_active_created_idx
  on public.point_transactions (created_at desc) where deleted_at is null;
create index if not exists shirt_orders_active_created_idx
  on public.shirt_orders (created_at desc) where deleted_at is null;
create index if not exists public_panel_items_active_created_idx
  on public.public_panel_items (created_at desc) where deleted_at is null;
create index if not exists offers_active_created_idx
  on public.offers (created_at desc) where deleted_at is null;
create index if not exists payment_receipts_active_uploaded_idx
  on public.payment_receipts (uploaded_at desc) where deleted_at is null;
create index if not exists service_scale_schedules_active_created_idx
  on public.service_scale_schedules (created_at desc) where deleted_at is null;
create index if not exists automated_messages_active_scheduled_idx
  on public.automated_messages (scheduled_at) where deleted_at is null;

create or replace function public.admin_get_dashboard_summary()
returns table(
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
set search_path = ''
as $$
begin
  if not public.forjados_is_admin_or_director() then
    raise exception 'Sem permissão para acessar o dashboard administrativo.';
  end if;

  return query
  select
    (select count(*) from public.profiles profile where profile.inscription_status::text = 'pending' and coalesce(profile.is_deleted, false) = false),
    (select count(*) from public.payment_receipts receipt where receipt.status::text = 'pending' and receipt.deleted_at is null),
    (select count(*) from public.shirt_orders shirt_order where shirt_order.status::text in ('waiting_payment', 'receipt_sent') and shirt_order.deleted_at is null),
    (select count(*) from public.points_redemptions redemption where redemption.status = 'pending' and redemption.deleted_at is null),
    (select count(*) from public.rides ride where ride.status::text = 'available' and ride.deleted_at is null),
    (select count(*) from public.public_panel_items item where item.is_active = true and item.deleted_at is null),
    (select count(*) from public.profiles profile where profile.inscription_status::text = 'approved' and coalesce(profile.is_deleted, false) = false),
    (select count(*) from public.profiles profile where coalesce(profile.is_deleted, false) = false),
    (select count(*) from public.profiles profile where profile.inscription_status::text = 'pending' and coalesce(profile.is_deleted, false) = false),
    (select count(*) from public.profiles profile where profile.inscription_status::text = 'rejected' and coalesce(profile.is_deleted, false) = false),
    (select count(*) from public.profiles profile where profile.role::text = 'leader' and coalesce(profile.is_deleted, false) = false),
    (select count(*) from public.profiles profile where profile.role::text = 'director' and coalesce(profile.is_deleted, false) = false),
    (select count(*) from public.profiles profile where profile.role::text = 'treasury' and coalesce(profile.is_deleted, false) = false),
    (select count(*) from public.shirts shirt where shirt.is_active = true and shirt.deleted_at is null),
    (select count(*) from public.shirt_orders shirt_order where shirt_order.deleted_at is null),
    (select count(*) from public.points_store_products product where product.is_active = true and product.deleted_at is null),
    (select count(*) from public.points_redemptions redemption where redemption.deleted_at is null),
    (select count(*) from public.offers offer where offer.status = 'pending' and offer.deleted_at is null),
    (select count(*) from public.offers offer where offer.status = 'approved' and offer.deleted_at is null),
    coalesce((select sum(offer.amount) from public.offers offer where offer.deleted_at is null), 0)::numeric,
    coalesce((select sum(offer.amount) from public.offers offer where offer.status = 'approved' and offer.deleted_at is null), 0)::numeric,
    coalesce((select sum(receipt.amount) from public.payment_receipts receipt where receipt.status::text = 'approved' and receipt.type = 'inscription' and receipt.deleted_at is null), 0)::numeric,
    (select count(*) from public.automated_messages message where message.status = 'scheduled' and message.deleted_at is null),
    (select count(*) from public.service_scale_schedules schedule where schedule.status = 'published' and schedule.deleted_at is null),
    (select count(*) from public.retreat_events event where event.active = true);
end;
$$;

create or replace function public.points_list_transactions()
returns setof public.point_transactions
language sql
stable
security definer
set search_path = ''
as $$
  select point_entry.*
  from public.point_transactions point_entry
  left join public.profiles target on target.id = point_entry.user_id
  join public.profiles viewer on viewer.id = (select auth.uid())
  where point_entry.deleted_at is null
    and (
      viewer.is_admin = true
      or viewer.role::text in ('admin', 'director')
      or point_entry.user_id = (select auth.uid())
      or (
        viewer.role::text = 'leader'
        and target.inscription_status::text = 'approved'
        and (
          (viewer.primary_team is not null and target.primary_team = viewer.primary_team)
          or coalesce(viewer.sectors, '{}'::text[]) && coalesce(target.sectors, '{}'::text[])
        )
      )
    )
  order by point_entry.created_at desc;
$$;

create or replace function public.forjados_process_due_automated_messages()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message record;
  v_target record;
  v_total_messages integer := 0;
  v_total_notifications integer := 0;
  v_inserted integer := 0;
  v_error text;
begin
  for v_message in
    select message.*
    from public.automated_messages message
    where message.status = 'scheduled'
      and message.deleted_at is null
      and message.scheduled_at <= now()
    order by message.scheduled_at asc
    for update skip locked
  loop
    begin
      v_inserted := 0;

      for v_target in
        select distinct profile.id
        from public.profiles profile
        where coalesce(profile.is_deleted, false) = false
          and profile.id is not null
          and coalesce(profile.is_admin, false) = false
          and profile.role::text <> 'admin'
          and (
            v_message.target = 'all'
            or (v_message.target = 'approved' and profile.inscription_status::text = 'approved')
            or (v_message.target = 'pending' and profile.inscription_status::text = 'pending')
            or (v_message.target = 'leaders' and profile.role::text in ('leader', 'director'))
            or (
              v_message.target = 'team'
              and coalesce(v_message.target_team, '') <> ''
              and (
                profile.primary_team = v_message.target_team
                or coalesce(profile.sectors, '{}'::text[]) @> array[v_message.target_team]::text[]
              )
            )
          )
      loop
        insert into public.app_notifications (
          user_id, title, message, type, is_read, created_at
        ) values (
          v_target.id, v_message.title, v_message.message,
          'automated_message', false, now()
        );
        v_inserted := v_inserted + 1;
      end loop;

      update public.automated_messages
      set status = 'sent',
          sent_at = now(),
          sent_count = v_inserted,
          last_error = null,
          updated_at = now()
      where id = v_message.id
        and deleted_at is null;

      v_total_messages := v_total_messages + 1;
      v_total_notifications := v_total_notifications + v_inserted;
    exception when others then
      v_error := sqlerrm;
      update public.automated_messages
      set status = 'failed', last_error = v_error, updated_at = now()
      where id = v_message.id
        and deleted_at is null;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'processed_messages', v_total_messages,
    'created_notifications', v_total_notifications,
    'processed_at', now()
  );
end;
$$;

create or replace function public.forjados_admin_soft_delete_record_v1(
  p_entity_type text,
  p_entity_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := trim(coalesce(p_reason, ''));
  v_user_id uuid;
  v_product_id uuid;
  v_transaction_id uuid;
  v_edition_id uuid;
  v_order_id uuid;
  v_amount integer := 0;
  v_points_cost integer := 0;
  v_created_at timestamptz;
  v_status text;
  v_receipt_type text;
  v_rows integer := 0;
  v_item record;
  v_remaining_receipt record;
  v_stock jsonb;
  v_stock_quantity integer;
  v_size text;
  v_side_effects jsonb := '{}'::jsonb;
begin
  if v_actor_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.forjados_is_admin() then
    raise exception 'Apenas administradores podem excluir históricos.';
  end if;

  if length(v_reason) < 3 then
    raise exception 'Informe um motivo com pelo menos 3 caracteres.';
  end if;

  if length(v_reason) > 500 then
    raise exception 'O motivo deve ter no máximo 500 caracteres.';
  end if;

  case p_entity_type
    when 'rides' then
      select ride.driver_id
      into v_user_id
      from public.rides ride
      where ride.id = p_entity_id and ride.deleted_at is null
      for update;

      if not found then raise exception 'Carona não encontrada ou já excluída.'; end if;

      update public.rides
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason, updated_at = now()
      where id = p_entity_id and deleted_at is null;

      select coalesce(sum(point_entry.amount), 0)::integer
      into v_amount
      from public.point_transactions point_entry
      where point_entry.source_type = 'ride'
        and point_entry.source_id = p_entity_id
        and point_entry.deleted_at is null;

      update public.point_transactions
      set deleted_at = now(), deleted_by = v_actor_id,
          delete_reason = 'Exclusão da carona: ' || v_reason
      where source_type = 'ride' and source_id = p_entity_id and deleted_at is null;

      if v_amount <> 0 then
        update public.profiles
        set points = greatest(0, points - v_amount), updated_at = now()
        where id = v_user_id;
      end if;
      v_side_effects := jsonb_build_object('honor_adjustment', -v_amount);

    when 'point_transactions' then
      select point_entry.user_id, point_entry.amount
      into v_user_id, v_amount
      from public.point_transactions point_entry
      where point_entry.id = p_entity_id and point_entry.deleted_at is null
      for update;

      if not found then raise exception 'Lançamento não encontrado ou já excluído.'; end if;

      update public.point_transactions
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason
      where id = p_entity_id and deleted_at is null;

      update public.profiles
      set points = greatest(0, points - v_amount), updated_at = now()
      where id = v_user_id;
      v_side_effects := jsonb_build_object('honor_adjustment', -v_amount);

    when 'points_redemptions' then
      select redemption.user_id, redemption.product_id, redemption.points_cost, redemption.created_at
      into v_user_id, v_product_id, v_points_cost, v_created_at
      from public.points_redemptions redemption
      where redemption.id = p_entity_id and redemption.deleted_at is null
      for update;

      if not found then raise exception 'Resgate não encontrado ou já excluído.'; end if;

      update public.points_redemptions
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason, updated_at = now()
      where id = p_entity_id and deleted_at is null;

      select point_entry.id
      into v_transaction_id
      from public.point_transactions point_entry
      where point_entry.user_id = v_user_id
        and point_entry.source_type = 'redemption'
        and point_entry.source_id is not distinct from v_product_id
        and point_entry.amount = -v_points_cost
        and point_entry.deleted_at is null
      order by abs(extract(epoch from (point_entry.created_at - v_created_at))) asc
      limit 1
      for update;

      if v_transaction_id is not null then
        update public.point_transactions
        set deleted_at = now(), deleted_by = v_actor_id,
            delete_reason = 'Exclusão do resgate: ' || v_reason
        where id = v_transaction_id and deleted_at is null;

        update public.profiles
        set points = points + v_points_cost, updated_at = now()
        where id = v_user_id;
      end if;

      if v_product_id is not null then
        update public.points_store_products
        set stock = stock + 1, updated_at = now()
        where id = v_product_id;
      end if;
      v_side_effects := jsonb_build_object(
        'honor_restored', case when v_transaction_id is null then 0 else v_points_cost end,
        'stock_restored', v_product_id is not null
      );

    when 'shirt_orders' then
      select shirt_order.status::text
      into v_status
      from public.shirt_orders shirt_order
      where shirt_order.id = p_entity_id and shirt_order.deleted_at is null
      for update;

      if not found then raise exception 'Pedido não encontrado ou já excluído.'; end if;

      if v_status <> 'cancelled' then
        for v_item in
          select item.shirt_id, item.size, item.quantity
          from public.shirt_order_items item
          where item.order_id = p_entity_id and item.shirt_id is not null
          order by item.shirt_id, item.size
        loop
          v_size := upper(trim(v_item.size));
          select shirt.stock into v_stock
          from public.shirts shirt
          where shirt.id = v_item.shirt_id
          for update;

          if found then
            v_stock_quantity := coalesce((v_stock->>v_size)::integer, 0);
            update public.shirts
            set stock = jsonb_set(stock, array[v_size], to_jsonb(v_stock_quantity + v_item.quantity), true),
                updated_at = now()
            where id = v_item.shirt_id;
          end if;
        end loop;
      end if;

      update public.shirt_orders
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason, updated_at = now()
      where id = p_entity_id and deleted_at is null;

      update public.payment_receipts
      set deleted_at = now(), deleted_by = v_actor_id,
          delete_reason = 'Exclusão do pedido de camisas: ' || v_reason,
          updated_at = now()
      where order_id = p_entity_id and deleted_at is null;
      get diagnostics v_rows = row_count;
      v_side_effects := jsonb_build_object(
        'stock_restored', v_status <> 'cancelled',
        'receipts_hidden', v_rows
      );

    when 'payment_receipts' then
      select receipt.user_id, receipt.type, receipt.edition_id, receipt.order_id
      into v_user_id, v_receipt_type, v_edition_id, v_order_id
      from public.payment_receipts receipt
      where receipt.id = p_entity_id and receipt.deleted_at is null
      for update;

      if not found then raise exception 'Comprovante não encontrado ou já excluído.'; end if;

      update public.payment_receipts
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason, updated_at = now()
      where id = p_entity_id and deleted_at is null;

      if v_receipt_type = 'inscription' then
        delete from public.retreat_participations participation
        where participation.confirmed_by_payment_id = p_entity_id;

        if v_edition_id is not null then
          select receipt.id, receipt.status::text as status, receipt.reviewed_by, receipt.reviewed_at
          into v_remaining_receipt
          from public.payment_receipts receipt
          where receipt.user_id = v_user_id
            and receipt.edition_id = v_edition_id
            and receipt.type = 'inscription'
            and receipt.deleted_at is null
          order by case receipt.status::text when 'approved' then 1 when 'pending' then 2 else 3 end,
                   receipt.uploaded_at desc
          limit 1;

          if found then
            update public.edition_enrollments
            set enrollment_status = case when v_remaining_receipt.status = 'approved' then 'approved' else 'pending' end,
                payment_status = v_remaining_receipt.status,
                paid_at = case when v_remaining_receipt.status = 'approved' then coalesce(v_remaining_receipt.reviewed_at, now()) else null end,
                approved_by = case when v_remaining_receipt.status = 'approved' then v_remaining_receipt.reviewed_by else null end,
                approved_at = case when v_remaining_receipt.status = 'approved' then coalesce(v_remaining_receipt.reviewed_at, now()) else null end,
                updated_at = now()
            where edition_id = v_edition_id and user_id = v_user_id;

            if v_remaining_receipt.status = 'approved' then
              insert into public.retreat_participations (
                user_id, retreat_title, edition_id, confirmed_by_payment_id, confirmed_by, confirmed_at
              )
              select v_user_id, edition.title, edition.id, v_remaining_receipt.id,
                     v_remaining_receipt.reviewed_by, coalesce(v_remaining_receipt.reviewed_at, now())
              from public.forjados_editions edition
              where edition.id = v_edition_id
              on conflict (user_id, edition_id) where edition_id is not null do update
                set retreat_title = excluded.retreat_title,
                    confirmed_by_payment_id = excluded.confirmed_by_payment_id,
                    confirmed_by = excluded.confirmed_by,
                    confirmed_at = excluded.confirmed_at;
            else
              delete from public.retreat_participations participation
              where participation.user_id = v_user_id and participation.edition_id = v_edition_id;
            end if;
          else
            update public.edition_enrollments
            set enrollment_status = 'pending', payment_status = 'pending', paid_at = null,
                approved_by = null, approved_at = null, updated_at = now()
            where edition_id = v_edition_id and user_id = v_user_id;

            delete from public.retreat_participations participation
            where participation.user_id = v_user_id and participation.edition_id = v_edition_id;
          end if;
        end if;

        update public.profiles profile
        set retreat_count = (
              select count(distinct coalesce(receipt.edition_id::text, 'legacy:' || receipt.id::text))::integer
              from public.payment_receipts receipt
              where receipt.user_id = v_user_id
                and receipt.type = 'inscription'
                and receipt.status::text = 'approved'
                and receipt.deleted_at is null
            ),
            updated_at = now()
        where profile.id = v_user_id;
      elsif v_receipt_type = 'order' and v_order_id is not null then
        update public.shirt_orders
        set status = 'waiting_payment'::public.order_status, updated_at = now()
        where id = v_order_id
          and deleted_at is null
          and status::text in ('receipt_sent', 'payment_rejected', 'payment_approved');
      end if;
      v_side_effects := jsonb_build_object('type', v_receipt_type, 'edition_id', v_edition_id, 'order_id', v_order_id);

    when 'public_panel_items' then
      update public.public_panel_items
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason, updated_at = now()
      where id = p_entity_id and deleted_at is null;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then raise exception 'Publicação não encontrada ou já excluída.'; end if;

    when 'offers' then
      update public.offers
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason, updated_at = now()
      where id = p_entity_id and deleted_at is null;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then raise exception 'Oferta não encontrada ou já excluída.'; end if;

    when 'service_scale_schedules' then
      update public.service_scale_schedules
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason, updated_at = now()
      where id = p_entity_id and deleted_at is null;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then raise exception 'Escala não encontrada ou já excluída.'; end if;

    when 'automated_messages' then
      update public.automated_messages
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason,
          status = case when status = 'scheduled' then 'cancelled' else status end,
          updated_at = now()
      where id = p_entity_id and deleted_at is null;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then raise exception 'Mensagem não encontrada ou já excluída.'; end if;

    else
      raise exception 'Tipo de histórico não permitido: %', p_entity_type;
  end case;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata, created_at
  ) values (
    v_actor_id,
    'history.soft_delete',
    p_entity_type,
    p_entity_id::text,
    'Histórico retirado da operação normal pelo administrador.',
    jsonb_build_object('reason', v_reason, 'side_effects', v_side_effects),
    now()
  );
end;
$$;

revoke all on function public.forjados_admin_soft_delete_record_v1(text, uuid, text) from public;
revoke all on function public.forjados_admin_soft_delete_record_v1(text, uuid, text) from anon;
revoke all on function public.forjados_admin_soft_delete_record_v1(text, uuid, text) from authenticated;
grant execute on function public.forjados_admin_soft_delete_record_v1(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
