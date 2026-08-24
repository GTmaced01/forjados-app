-- FORJADOS 2.1R — estabilização técnica, inscrições e comprovantes privados.
-- Aplicar somente depois de validar esta migration contra o projeto Supabase do FORJADOS.
-- O frontend desta versão depende destas RPCs; publicar o banco antes do frontend.

begin;

alter table if exists public.retreat_events
  add column if not exists registration_fee numeric(10,2) not null default 80,
  add column if not exists registration_open boolean not null default true;

alter table if exists public.payment_receipts
  add column if not exists file_path text,
  add column if not exists event_id uuid references public.retreat_events(id) on delete restrict;

alter table if exists public.offers
  add column if not exists proof_path text;

alter table if exists public.shirt_orders
  add column if not exists proof_path text;

create index if not exists payment_receipts_user_event_idx
  on public.payment_receipts (user_id, event_id, uploaded_at desc);

create index if not exists payment_receipts_event_id_idx
  on public.payment_receipts (event_id)
  where event_id is not null;

create index if not exists payment_receipts_file_path_idx
  on public.payment_receipts (file_path)
  where file_path is not null;

create index if not exists offers_proof_path_idx
  on public.offers (proof_path)
  where proof_path is not null;

create index if not exists offers_user_created_idx
  on public.offers (user_id, created_at desc);

create index if not exists shirt_orders_proof_path_idx
  on public.shirt_orders (proof_path)
  where proof_path is not null;

create index if not exists shirt_orders_user_created_idx
  on public.shirt_orders (user_id, created_at desc);

create index if not exists shirt_order_items_order_id_idx
  on public.shirt_order_items (order_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'retreat_events_registration_fee_nonnegative'
      and conrelid = 'public.retreat_events'::regclass
  ) then
    alter table public.retreat_events
      add constraint retreat_events_registration_fee_nonnegative
      check (registration_fee >= 0);
  end if;
end;
$$;

-- Mantém os comprovantes já existentes vinculados à edição ativa no momento da migração.
with active_event as (
  select id
  from public.retreat_events
  where active = true
  order by start_date asc
  limit 1
)
update public.payment_receipts receipt
set event_id = active_event.id
from active_event
where receipt.type = 'inscription'
  and receipt.event_id is null;

-- O bucket financeiro deixa de ser público e passa a impor tamanho e MIME no servidor.
update storage.buckets
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/png', 'image/jpeg', 'application/pdf']::text[]
where id = 'payment-receipts';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.forjados_has_any_role_v1(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and (
        coalesce(profile.is_admin, false)
        or profile.role::text = any(p_roles)
      )
  );
$$;

revoke all on function private.forjados_has_any_role_v1(text[]) from public, anon;
grant execute on function private.forjados_has_any_role_v1(text[]) to authenticated;

create or replace function public.forjados_ensure_my_profile_v1()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_auth_user auth.users%rowtype;
  v_profile public.profiles%rowtype;
  v_display_name text;
  v_requested_role public.profiles.requested_role%type;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;

  select * into v_profile from public.profiles where id = v_user_id;
  if found then return v_profile; end if;

  select * into v_auth_user from auth.users where id = v_user_id;
  if not found then raise exception 'Usuário de autenticação não encontrado.'; end if;

  v_display_name := coalesce(
    nullif(trim(v_auth_user.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(v_auth_user.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(v_auth_user.email, ''), '@', 1),
    'Novo usuário'
  );

  if v_auth_user.raw_user_meta_data->>'requested_role' in ('member', 'leader', 'director', 'treasury') then
    v_requested_role := v_auth_user.raw_user_meta_data->>'requested_role';
  else
    v_requested_role := 'member';
  end if;

  insert into public.profiles (
    id, email, display_name, full_name, role, requested_role,
    inscription_status, is_admin, member_id, sectors, primary_team,
    has_vehicle, skills, points, terms_accepted
  ) values (
    v_user_id, coalesce(v_auth_user.email, ''), left(v_display_name, 160), left(v_display_name, 160),
    'member', v_requested_role, 'pending', false,
    'EQP-' || upper(left(replace(v_user_id::text, '-', ''), 10)),
    array[]::text[], null, false, array[]::text[], 0, '{}'::jsonb
  )
  on conflict (id) do nothing;

  select * into v_profile from public.profiles where id = v_user_id;
  if not found then raise exception 'Não foi possível preparar o perfil.'; end if;
  return v_profile;
end;
$$;

create or replace function public.forjados_update_my_profile_v1(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_requested_role public.profiles.requested_role%type;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Dados de perfil inválidos.'; end if;
  if p_payload ? 'display_name' and nullif(trim(p_payload->>'display_name'), '') is null then raise exception 'Nome é obrigatório.'; end if;
  if p_payload ? 'sectors' and (jsonb_typeof(p_payload->'sectors') <> 'array' or jsonb_array_length(p_payload->'sectors') > 20) then raise exception 'Setores inválidos.'; end if;
  if p_payload ? 'skills' and (jsonb_typeof(p_payload->'skills') <> 'array' or jsonb_array_length(p_payload->'skills') > 50) then raise exception 'Habilidades inválidas.'; end if;

  select requested_role into v_requested_role from public.profiles where id = v_user_id;
  if not found then raise exception 'Perfil não encontrado.'; end if;
  if p_payload ? 'requested_role' then
    if p_payload->>'requested_role' not in ('member', 'leader', 'director', 'treasury') then raise exception 'Tipo de participação inválido.'; end if;
    v_requested_role := p_payload->>'requested_role';
  end if;

  update public.profiles as profile
  set display_name = case when p_payload ? 'display_name' then left(trim(p_payload->>'display_name'), 160) else profile.display_name end,
      full_name = case when p_payload ? 'display_name' then left(trim(p_payload->>'display_name'), 160) else profile.full_name end,
      phone = case when p_payload ? 'phone' then left(coalesce(p_payload->>'phone', ''), 40) else profile.phone end,
      birth_date = case when p_payload ? 'birth_date' then nullif(p_payload->>'birth_date', '')::date else profile.birth_date end,
      city = case when p_payload ? 'city' then left(coalesce(p_payload->>'city', ''), 120) else profile.city end,
      neighborhood = case when p_payload ? 'neighborhood' then left(coalesce(p_payload->>'neighborhood', ''), 120) else profile.neighborhood end,
      member_since = case when p_payload ? 'member_since' then nullif(p_payload->>'member_since', '')::date else profile.member_since end,
      requested_role = v_requested_role,
      primary_team = case when p_payload ? 'primary_team' then nullif(left(coalesce(p_payload->>'primary_team', ''), 120), '') else profile.primary_team end,
      sectors = case when p_payload ? 'sectors' then array(select jsonb_array_elements_text(p_payload->'sectors')) else profile.sectors end,
      specific_function = case when p_payload ? 'specific_function' then left(coalesce(p_payload->>'specific_function', ''), 160) else profile.specific_function end,
      experience_level = case when p_payload ? 'experience_level' then left(coalesce(p_payload->>'experience_level', ''), 80) else profile.experience_level end,
      shirt_size = case when p_payload ? 'shirt_size' then left(coalesce(p_payload->>'shirt_size', ''), 20) else profile.shirt_size end,
      has_vehicle = case when p_payload ? 'has_vehicle' then coalesce((p_payload->>'has_vehicle')::boolean, false) else profile.has_vehicle end,
      skills = case when p_payload ? 'skills' then array(select jsonb_array_elements_text(p_payload->'skills')) else profile.skills end,
      food_restrictions = case when p_payload ? 'food_restrictions' then left(coalesce(p_payload->>'food_restrictions', ''), 2000) else profile.food_restrictions end,
      health_problems = case when p_payload ? 'health_problems' then left(coalesce(p_payload->>'health_problems', ''), 2000) else profile.health_problems end,
      continuous_medicine = case when p_payload ? 'continuous_medicine' then left(coalesce(p_payload->>'continuous_medicine', ''), 2000) else profile.continuous_medicine end,
      emergency_contact = case when p_payload ? 'emergency_contact' then coalesce(p_payload->'emergency_contact', '{}'::jsonb) else profile.emergency_contact end,
      terms_accepted = case when p_payload ? 'terms_accepted' then coalesce(p_payload->'terms_accepted', '{}'::jsonb) else profile.terms_accepted end,
      updated_at = now()
  where profile.id = v_user_id;
end;
$$;

alter table if exists public.payment_receipts enable row level security;
alter table if exists public.profiles enable row level security;
alter table if exists public.offers enable row level security;
alter table if exists public.shirt_orders enable row level security;
alter table if exists public.shirt_order_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'forjados_2_1r_profiles_select_own') then
    create policy forjados_2_1r_profiles_select_own
      on public.profiles for select to authenticated
      using (id = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_receipts' and policyname = 'forjados_2_1r_receipts_select') then
    create policy forjados_2_1r_receipts_select
      on public.payment_receipts for select to authenticated
      using (
        user_id = (select auth.uid())
        or (select private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']))
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'offers' and policyname = 'forjados_2_1r_offers_select') then
    create policy forjados_2_1r_offers_select
      on public.offers for select to authenticated
      using (
        user_id = (select auth.uid())
        or (select private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']))
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shirt_orders' and policyname = 'forjados_2_1r_shirt_orders_select') then
    create policy forjados_2_1r_shirt_orders_select
      on public.shirt_orders for select to authenticated
      using (
        user_id = (select auth.uid())
        or (select private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']))
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shirt_order_items' and policyname = 'forjados_2_1r_shirt_order_items_select') then
    create policy forjados_2_1r_shirt_order_items_select
      on public.shirt_order_items for select to authenticated
      using (
        exists (
          select 1
          from public.shirt_orders orders
          where orders.id = shirt_order_items.order_id
            and (
              orders.user_id = (select auth.uid())
              or (select private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']))
            )
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'forjados_2_1r_private_receipt_upload') then
    create policy forjados_2_1r_private_receipt_upload
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'payment-receipts'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'forjados_2_1r_private_receipt_read') then
    create policy forjados_2_1r_private_receipt_read
      on storage.objects for select to authenticated
      using (
        bucket_id = 'payment-receipts'
        and (
          (storage.foldername(name))[1] = (select auth.uid())::text
          or (select private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']))
        )
      );
  end if;
end;
$$;

create or replace function public.forjados_submit_inscription_receipt_v1(
  p_file_path text,
  p_file_name text,
  p_file_type text,
  p_user_name text,
  p_user_email text,
  p_user_whatsapp text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event_id uuid;
  v_amount numeric(10,2);
  v_registration_open boolean;
  v_receipt_id uuid;
  v_user_name text;
  v_user_email text;
  v_user_whatsapp text;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;

  select event.id, event.registration_fee, event.registration_open
  into v_event_id, v_amount, v_registration_open
  from public.retreat_events event
  where event.active = true
  order by event.start_date asc
  limit 1;

  if v_event_id is null then raise exception 'Não existe uma edição ativa.'; end if;
  if not v_registration_open then raise exception 'As inscrições desta edição estão fechadas.'; end if;
  if p_file_path is null or p_file_path not like (v_user_id::text || '/%') then
    raise exception 'Caminho de comprovante inválido.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'payment-receipts' and name = p_file_path) then
    raise exception 'O arquivo enviado não foi encontrado.';
  end if;

  select coalesce(nullif(profile.display_name, ''), nullif(p_user_name, ''), 'Participante'),
         coalesce(nullif(profile.email, ''), nullif(p_user_email, ''), auth_user.email, ''),
         coalesce(nullif(profile.phone, ''), p_user_whatsapp, '')
  into v_user_name, v_user_email, v_user_whatsapp
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = v_user_id;

  insert into public.payment_receipts (
    user_id, user_name, user_email, user_whatsapp, amount,
    file_url, file_path, file_name, file_type, status, type, event_id
  ) values (
    v_user_id, v_user_name, v_user_email, v_user_whatsapp, v_amount,
    '', p_file_path, left(p_file_name, 255), left(p_file_type, 120), 'pending', 'inscription', v_event_id
  ) returning id into v_receipt_id;

  return v_receipt_id;
end;
$$;

create or replace function public.forjados_create_shirt_order_v1(p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_item jsonb;
  v_shirt_id uuid;
  v_size text;
  v_quantity integer;
  v_name text;
  v_price numeric(10,2);
  v_stock jsonb;
  v_stock_quantity integer;
  v_active boolean;
  v_total numeric(12,2) := 0;
  v_order_id uuid;
  v_seen text[] := array[]::text[];
  v_key text;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Carrinho inválido.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) order by value->>'shirt_id', value->>'size'
  loop
    begin
      v_shirt_id := (v_item->>'shirt_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Item de carrinho inválido.';
    end;
    v_size := upper(trim(coalesce(v_item->>'size', '')));
    if v_quantity < 1 or v_quantity > 20 or v_size = '' then raise exception 'Quantidade ou tamanho inválido.'; end if;

    v_key := v_shirt_id::text || ':' || v_size;
    if v_key = any(v_seen) then raise exception 'O carrinho contém itens duplicados.'; end if;
    v_seen := array_append(v_seen, v_key);

    select shirt.name, shirt.price, shirt.stock::jsonb, shirt.is_active
    into v_name, v_price, v_stock, v_active
    from public.shirts shirt
    where shirt.id = v_shirt_id
    for update;

    if not found or not v_active then raise exception 'Uma das camisas não está disponível.'; end if;
    v_stock_quantity := coalesce((v_stock->>v_size)::integer, 0);
    if v_stock_quantity < v_quantity then raise exception 'Estoque insuficiente para % / %.', v_name, v_size; end if;
    v_total := v_total + (v_price * v_quantity);
  end loop;

  insert into public.shirt_orders (user_id, total_price, status)
  values (v_user_id, v_total, 'waiting_payment')
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) order by value->>'shirt_id', value->>'size'
  loop
    v_shirt_id := (v_item->>'shirt_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_size := upper(trim(v_item->>'size'));

    select shirt.name, shirt.price, shirt.stock::jsonb
    into v_name, v_price, v_stock
    from public.shirts shirt
    where shirt.id = v_shirt_id;

    v_stock_quantity := coalesce((v_stock->>v_size)::integer, 0);
    insert into public.shirt_order_items (order_id, shirt_id, name, size, quantity, price)
    values (v_order_id, v_shirt_id, v_name, v_size, v_quantity, v_price);

    update public.shirts
    set stock = jsonb_set(stock::jsonb, array[v_size], to_jsonb(v_stock_quantity - v_quantity), true),
        updated_at = now()
    where id = v_shirt_id;
  end loop;

  return v_order_id;
end;
$$;

create or replace function public.forjados_submit_shirt_order_receipt_v1(
  p_order_id uuid,
  p_file_path text,
  p_file_name text,
  p_file_type text,
  p_user_name text,
  p_user_email text,
  p_user_whatsapp text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_amount numeric(12,2);
  v_receipt_id uuid;
  v_user_name text;
  v_user_email text;
  v_user_whatsapp text;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  if p_file_path not like (v_user_id::text || '/shirt-orders/' || p_order_id::text || '/%') then
    raise exception 'Caminho de comprovante inválido.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'payment-receipts' and name = p_file_path) then
    raise exception 'O arquivo enviado não foi encontrado.';
  end if;

  select orders.total_price
  into v_amount
  from public.shirt_orders orders
  where orders.id = p_order_id
    and orders.user_id = v_user_id
    and orders.status in ('waiting_payment', 'payment_rejected')
  for update;
  if not found then raise exception 'Pedido não encontrado ou indisponível para comprovante.'; end if;

  select coalesce(nullif(profile.display_name, ''), nullif(p_user_name, ''), 'Participante'),
         coalesce(nullif(profile.email, ''), nullif(p_user_email, ''), auth_user.email, ''),
         coalesce(nullif(profile.phone, ''), p_user_whatsapp, '')
  into v_user_name, v_user_email, v_user_whatsapp
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = v_user_id;

  insert into public.payment_receipts (
    user_id, user_name, user_email, user_whatsapp, amount,
    file_url, file_path, file_name, file_type, status, type, order_id
  ) values (
    v_user_id, v_user_name, v_user_email, v_user_whatsapp, v_amount,
    '', p_file_path, left(p_file_name, 255), left(p_file_type, 120), 'pending', 'order', p_order_id
  ) returning id into v_receipt_id;

  update public.shirt_orders
  set status = 'receipt_sent', proof_url = '', proof_path = p_file_path, updated_at = now()
  where id = p_order_id;

  return v_receipt_id;
end;
$$;

create or replace function public.forjados_create_offer_v1(
  p_amount numeric,
  p_method text,
  p_objective text,
  p_notes text,
  p_proof_path text,
  p_user_name text,
  p_user_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_offer_id uuid;
  v_user_name text;
  v_user_email text;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'Valor de oferta inválido.'; end if;
  if p_method not in ('pix', 'card', 'cash', 'other') then raise exception 'Forma de oferta inválida.'; end if;
  if nullif(trim(p_objective), '') is null then raise exception 'Informe o objetivo da oferta.'; end if;
  if p_proof_path is not null and p_proof_path <> '' then
    if p_proof_path not like (v_user_id::text || '/ofertas/%') then raise exception 'Caminho de comprovante inválido.'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'payment-receipts' and name = p_proof_path) then
      raise exception 'O arquivo enviado não foi encontrado.';
    end if;
  end if;

  select coalesce(nullif(profile.display_name, ''), nullif(p_user_name, ''), 'Participante'),
         coalesce(nullif(profile.email, ''), nullif(p_user_email, ''), auth_user.email, '')
  into v_user_name, v_user_email
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = v_user_id;

  insert into public.offers (
    user_id, user_name, user_email, amount, method, objective, notes, proof_url, proof_path, status
  ) values (
    v_user_id, v_user_name, v_user_email, round(p_amount, 2), p_method,
    left(trim(p_objective), 160), left(coalesce(p_notes, ''), 2000), '', nullif(p_proof_path, ''), 'pending'
  ) returning id into v_offer_id;

  return v_offer_id;
end;
$$;

create or replace function public.forjados_review_payment_receipt_v1(
  p_receipt_id uuid,
  p_status text,
  p_observations text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']) then raise exception 'Acesso negado.'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Status inválido.'; end if;

  update public.payment_receipts
  set status = p_status,
      observations = left(coalesce(p_observations, ''), 2000),
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where id = p_receipt_id;
  if not found then raise exception 'Comprovante não encontrado.'; end if;
end;
$$;

create or replace function public.forjados_review_offer_v1(p_offer_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']) then raise exception 'Acesso negado.'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Status inválido.'; end if;

  update public.offers
  set status = p_status, reviewed_by = (select auth.uid()), reviewed_at = now(), updated_at = now()
  where id = p_offer_id;
  if not found then raise exception 'Oferta não encontrada.'; end if;
end;
$$;

create or replace function public.forjados_review_shirt_order_v1(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']) then raise exception 'Acesso negado.'; end if;
  if p_status not in ('payment_approved', 'payment_rejected', 'delivered', 'cancelled') then raise exception 'Status inválido.'; end if;

  update public.shirt_orders set status = p_status, updated_at = now() where id = p_order_id;
  if not found then raise exception 'Pedido não encontrado.'; end if;
end;
$$;

create or replace function public.forjados_upsert_active_retreat_event_v1(
  p_title text,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_location text,
  p_registration_fee numeric,
  p_registration_open boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director']) then raise exception 'Acesso negado.'; end if;
  if nullif(trim(p_title), '') is null or p_start_date is null then raise exception 'Nome e início são obrigatórios.'; end if;
  if p_end_date is not null and p_end_date < p_start_date then raise exception 'A data final não pode ser anterior ao início.'; end if;
  if p_registration_fee is null or p_registration_fee < 0 then raise exception 'Valor de inscrição inválido.'; end if;

  update public.retreat_events set active = false, updated_at = now() where active = true;
  insert into public.retreat_events (
    title, start_date, end_date, location, registration_fee, registration_open, active
  ) values (
    left(trim(p_title), 160), p_start_date, p_end_date, left(coalesce(p_location, ''), 255),
    round(p_registration_fee, 2), coalesce(p_registration_open, false), true
  ) returning id into v_event_id;
  return v_event_id;
end;
$$;

revoke all on function public.forjados_submit_inscription_receipt_v1(text, text, text, text, text, text) from public, anon;
revoke all on function public.forjados_ensure_my_profile_v1() from public, anon;
revoke all on function public.forjados_update_my_profile_v1(jsonb) from public, anon;
revoke all on function public.forjados_create_shirt_order_v1(jsonb) from public, anon;
revoke all on function public.forjados_submit_shirt_order_receipt_v1(uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.forjados_create_offer_v1(numeric, text, text, text, text, text, text) from public, anon;
revoke all on function public.forjados_review_payment_receipt_v1(uuid, text, text) from public, anon;
revoke all on function public.forjados_review_offer_v1(uuid, text) from public, anon;
revoke all on function public.forjados_review_shirt_order_v1(uuid, text) from public, anon;
revoke all on function public.forjados_upsert_active_retreat_event_v1(text, timestamptz, timestamptz, text, numeric, boolean) from public, anon;

grant execute on function public.forjados_submit_inscription_receipt_v1(text, text, text, text, text, text) to authenticated;
grant execute on function public.forjados_ensure_my_profile_v1() to authenticated;
grant execute on function public.forjados_update_my_profile_v1(jsonb) to authenticated;
grant execute on function public.forjados_create_shirt_order_v1(jsonb) to authenticated;
grant execute on function public.forjados_submit_shirt_order_receipt_v1(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.forjados_create_offer_v1(numeric, text, text, text, text, text, text) to authenticated;
grant execute on function public.forjados_review_payment_receipt_v1(uuid, text, text) to authenticated;
grant execute on function public.forjados_review_offer_v1(uuid, text) to authenticated;
grant execute on function public.forjados_review_shirt_order_v1(uuid, text) to authenticated;
grant execute on function public.forjados_upsert_active_retreat_event_v1(text, timestamptz, timestamptz, text, numeric, boolean) to authenticated;

-- Escritas críticas são exclusivamente transacionais e calculadas no banco.
revoke insert, update, delete on public.payment_receipts from authenticated;
revoke insert, update, delete on public.offers from authenticated;
revoke insert, update, delete on public.shirt_orders from authenticated;
revoke insert, update, delete on public.shirt_order_items from authenticated;
revoke insert, update, delete on public.retreat_events from authenticated;
revoke insert, update, delete on public.profiles from authenticated;

commit;
