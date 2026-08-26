-- FORJADOS 2.1R4 — lojas, escala variável e inscrição por edição.
-- Execute somente este arquivo. Não há cópia duplicada em supabase/*.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. Notificações de novos produtos
-- ---------------------------------------------------------------------------

create or replace function public.forjados_notify_new_store_item_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_store_name text;
  v_title text;
begin
  if new.is_active is not true or new.deleted_at is not null then
    return new;
  end if;

  v_store_name := case
    when tg_table_name = 'shirts' then 'Loja de Camisas'
    else 'Loja de Honra'
  end;
  v_title := case
    when tg_table_name = 'shirts' then 'Nova camisa disponível'
    else 'Novo item na Loja de Honra'
  end;

  insert into public.app_notifications (user_id, title, message, type)
  select
    profile.id,
    v_title,
    left(format('%s já está disponível na %s.', new.name, v_store_name), 2000),
    'store'
  from public.profiles profile
  where profile.inscription_status::text = 'approved'
    and coalesce(profile.is_deleted, false) is false;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    'store_item_created',
    tg_table_name,
    new.id::text,
    'Novo item de loja publicado e comunicado aos usuários aprovados.',
    jsonb_build_object('store', v_store_name, 'product_name', new.name)
  );

  return new;
end;
$$;

revoke all on function public.forjados_notify_new_store_item_v1()
  from public, anon, authenticated;

drop trigger if exists trg_forjados_notify_new_points_product on public.points_store_products;
create trigger trg_forjados_notify_new_points_product
after insert on public.points_store_products
for each row execute function public.forjados_notify_new_store_item_v1();

drop trigger if exists trg_forjados_notify_new_shirt on public.shirts;
create trigger trg_forjados_notify_new_shirt
after insert on public.shirts
for each row execute function public.forjados_notify_new_store_item_v1();

-- ---------------------------------------------------------------------------
-- 2. Escala variável por faixa horária
-- ---------------------------------------------------------------------------

create table if not exists public.service_scale_slot_requirements (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.service_scale_schedules(id) on delete cascade,
  slot_number integer not null,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  men_required integer not null default 0,
  women_required integer not null default 0,
  created_at timestamptz not null default now(),
  constraint service_scale_slot_requirements_number_positive check (slot_number > 0),
  constraint service_scale_slot_requirements_time_valid check (slot_end > slot_start),
  constraint service_scale_slot_requirements_staffing_valid check (
    men_required between 0 and 50
    and women_required between 0 and 50
    and men_required + women_required > 0
  ),
  constraint service_scale_slot_requirements_schedule_slot_unique unique (schedule_id, slot_number)
);

create index if not exists service_scale_slot_requirements_schedule_start_idx
  on public.service_scale_slot_requirements (schedule_id, slot_start);

alter table public.service_scale_slot_requirements enable row level security;

drop policy if exists forjados_service_scale_slot_requirements_select_manager
  on public.service_scale_slot_requirements;
create policy forjados_service_scale_slot_requirements_select_manager
on public.service_scale_slot_requirements
for select
to authenticated
using ((select public.can_manage_service_scale()));

drop policy if exists forjados_service_scale_slot_requirements_insert_manager
  on public.service_scale_slot_requirements;
create policy forjados_service_scale_slot_requirements_insert_manager
on public.service_scale_slot_requirements
for insert
to authenticated
with check ((select public.can_manage_service_scale()));

drop policy if exists forjados_service_scale_slot_requirements_update_manager
  on public.service_scale_slot_requirements;
create policy forjados_service_scale_slot_requirements_update_manager
on public.service_scale_slot_requirements
for update
to authenticated
using ((select public.can_manage_service_scale()))
with check ((select public.can_manage_service_scale()));

drop policy if exists forjados_service_scale_slot_requirements_delete_manager
  on public.service_scale_slot_requirements;
create policy forjados_service_scale_slot_requirements_delete_manager
on public.service_scale_slot_requirements
for delete
to authenticated
using ((select public.can_manage_service_scale()));

revoke all on table public.service_scale_slot_requirements from public, anon;
grant select, insert, update, delete on table public.service_scale_slot_requirements to authenticated;

create or replace function public.forjados_save_service_scale_v2(
  p_config jsonb,
  p_slots jsonb,
  p_assignments jsonb
)
returns public.service_scale_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_schedule public.service_scale_schedules%rowtype;
  v_title text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_shift_minutes integer;
  v_min_rest_minutes integer;
  v_avoid_consecutive boolean;
  v_status text;
  v_slot_count integer;
  v_min_slot integer;
  v_max_slot integer;
  v_max_men integer;
  v_max_women integer;
  v_notified_count integer := 0;
  v_notice record;
begin
  if v_actor_id is null or not (select public.can_manage_service_scale()) then
    raise exception 'Acesso negado para gerenciar a escala.' using errcode = '42501';
  end if;

  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Configuração da escala inválida.' using errcode = '22023';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array'
    or jsonb_array_length(p_slots) = 0 then
    raise exception 'Informe pelo menos uma faixa horária com pessoas no alojamento.' using errcode = '22023';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array'
    or jsonb_array_length(p_assignments) = 0 then
    raise exception 'A escala precisa ter pelo menos uma pessoa alocada.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_slots) item where jsonb_typeof(item.value) <> 'object'
  ) or exists (
    select 1 from jsonb_array_elements(p_assignments) item where jsonb_typeof(item.value) <> 'object'
  ) then
    raise exception 'Turnos ou alocações estão em formato inválido.' using errcode = '22023';
  end if;

  begin
    v_title := nullif(trim(p_config->>'title'), '');
    v_start_at := nullif(p_config->>'start_at', '')::timestamptz;
    v_end_at := nullif(p_config->>'end_at', '')::timestamptz;
    v_shift_minutes := nullif(p_config->>'shift_minutes', '')::integer;
    v_min_rest_minutes := nullif(p_config->>'min_rest_minutes', '')::integer;
    v_avoid_consecutive := coalesce((p_config->>'avoid_consecutive')::boolean, true);
    v_status := coalesce(nullif(p_config->>'status', ''), 'published');
  exception when others then
    raise exception 'Datas ou números da configuração são inválidos.' using errcode = '22023';
  end;

  if v_title is null or v_start_at is null or v_end_at is null then
    raise exception 'Nome, início e fim da escala são obrigatórios.' using errcode = '22023';
  end if;
  if v_end_at <= v_start_at then
    raise exception 'A data final precisa ser maior que a inicial.' using errcode = '22023';
  end if;
  if v_shift_minutes is null or v_shift_minutes < 15 or v_shift_minutes > 720 then
    raise exception 'A duração do serviço deve ficar entre 15 minutos e 12 horas.' using errcode = '22023';
  end if;
  if v_min_rest_minutes is null or v_min_rest_minutes < 0 or v_min_rest_minutes > 1440 then
    raise exception 'O descanso mínimo deve ficar entre 0 e 1.440 minutos.' using errcode = '22023';
  end if;
  if v_status not in ('draft', 'published') then
    raise exception 'Status da escala inválido.' using errcode = '22023';
  end if;

  select count(*)::integer, min(slot.slot_number), max(slot.slot_number),
         max(slot.men_required), max(slot.women_required)
  into v_slot_count, v_min_slot, v_max_slot, v_max_men, v_max_women
  from jsonb_to_recordset(p_slots) as slot(
    slot_number integer,
    slot_start timestamptz,
    slot_end timestamptz,
    men_required integer,
    women_required integer
  );

  if v_slot_count > 1000 then
    raise exception 'A escala excede o limite de 1.000 faixas horárias.' using errcode = '22023';
  end if;
  if v_min_slot is distinct from 1 or v_max_slot is distinct from v_slot_count
    or (select count(distinct slot.slot_number) from jsonb_to_recordset(p_slots) as slot(slot_number integer)) <> v_slot_count then
    raise exception 'As faixas horárias precisam estar numeradas em sequência, sem repetição.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_slots) as slot(
      slot_number integer,
      slot_start timestamptz,
      slot_end timestamptz,
      men_required integer,
      women_required integer
    )
    where slot.slot_number is null
      or slot.slot_start is null
      or slot.slot_end is null
      or slot.slot_start >= slot.slot_end
      or slot.slot_start < v_start_at
      or slot.slot_end > v_end_at
      or slot.slot_end - slot.slot_start > make_interval(mins => v_shift_minutes)
      or slot.men_required is null
      or slot.women_required is null
      or slot.men_required not between 0 and 50
      or slot.women_required not between 0 and 50
      or slot.men_required + slot.women_required < 1
  ) then
    raise exception 'Há uma faixa horária com data ou quantidade inválida.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select slot.slot_start,
             lag(slot.slot_end) over (order by slot.slot_start, slot.slot_number) as previous_end
      from jsonb_to_recordset(p_slots) as slot(
        slot_number integer,
        slot_start timestamptz,
        slot_end timestamptz,
        men_required integer,
        women_required integer
      )
    ) ordered_slots
    where ordered_slots.previous_end > ordered_slots.slot_start
  ) then
    raise exception 'As faixas horárias não podem se sobrepor.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as assignment(
      person_id uuid,
      gender text,
      slot_number integer,
      slot_start timestamptz,
      slot_end timestamptz,
      accommodation text
    )
    left join jsonb_to_recordset(p_slots) as slot(
      slot_number integer,
      slot_start timestamptz,
      slot_end timestamptz,
      men_required integer,
      women_required integer
    ) on slot.slot_number = assignment.slot_number
    where assignment.person_id is null
      or assignment.gender not in ('male', 'female')
      or assignment.accommodation not in ('male', 'female')
      or assignment.gender <> assignment.accommodation
      or slot.slot_number is null
      or assignment.slot_start is distinct from slot.slot_start
      or assignment.slot_end is distinct from slot.slot_end
  ) then
    raise exception 'Há uma alocação incompatível com as faixas horárias.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as assignment(
      person_id uuid,
      gender text,
      slot_number integer,
      slot_start timestamptz,
      slot_end timestamptz,
      accommodation text
    )
    group by assignment.person_id, assignment.slot_number
    having count(*) > 1
  ) then
    raise exception 'Uma pessoa não pode aparecer duas vezes na mesma faixa horária.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_slots) as slot(
      slot_number integer,
      slot_start timestamptz,
      slot_end timestamptz,
      men_required integer,
      women_required integer
    )
    left join (
      select assignment.slot_number,
             count(*) filter (where assignment.accommodation = 'male')::integer as men_count,
             count(*) filter (where assignment.accommodation = 'female')::integer as women_count
      from jsonb_to_recordset(p_assignments) as assignment(
        person_id uuid,
        gender text,
        slot_number integer,
        slot_start timestamptz,
        slot_end timestamptz,
        accommodation text
      )
      group by assignment.slot_number
    ) assigned on assigned.slot_number = slot.slot_number
    where coalesce(assigned.men_count, 0) <> slot.men_required
       or coalesce(assigned.women_count, 0) <> slot.women_required
  ) then
    raise exception 'Cada faixa horária precisa ter exatamente a quantidade de pessoas configurada.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as assignment(
      person_id uuid,
      gender text,
      slot_number integer,
      slot_start timestamptz,
      slot_end timestamptz,
      accommodation text
    )
    left join public.service_scale_people person on person.id = assignment.person_id
    where person.id is null
      or person.is_active is not true
      or person.does_trail is true
      or person.gender is distinct from assignment.gender
  ) then
    raise exception 'A escala contém pessoa inexistente, inativa, em trilha ou sem alojamento compatível.' using errcode = '22023';
  end if;

  insert into public.service_scale_schedules (
    title, start_at, end_at, shift_minutes, men_per_shift, women_per_shift,
    min_rest_minutes, avoid_consecutive, status, created_by
  ) values (
    left(v_title, 160), v_start_at, v_end_at, v_shift_minutes,
    coalesce(v_max_men, 0), coalesce(v_max_women, 0),
    v_min_rest_minutes, v_avoid_consecutive, v_status, v_actor_id
  ) returning * into v_schedule;

  insert into public.service_scale_slot_requirements (
    schedule_id, slot_number, slot_start, slot_end, men_required, women_required
  )
  select v_schedule.id, slot.slot_number, slot.slot_start, slot.slot_end,
         slot.men_required, slot.women_required
  from jsonb_to_recordset(p_slots) as slot(
    slot_number integer,
    slot_start timestamptz,
    slot_end timestamptz,
    men_required integer,
    women_required integer
  );

  insert into public.service_scale_assignments (
    schedule_id, person_id, person_name, gender, slot_number,
    slot_start, slot_end, accommodation
  )
  select
    v_schedule.id,
    assignment.person_id,
    coalesce(nullif(person.display_name, ''), nullif(person.name, ''), 'Pessoa sem nome'),
    assignment.gender,
    assignment.slot_number,
    assignment.slot_start,
    assignment.slot_end,
    assignment.accommodation
  from jsonb_to_recordset(p_assignments) as assignment(
    person_id uuid,
    gender text,
    slot_number integer,
    slot_start timestamptz,
    slot_end timestamptz,
    accommodation text
  )
  join public.service_scale_people person on person.id = assignment.person_id;

  if v_status = 'published' then
    for v_notice in
      select
        person.user_id,
        string_agg(
          to_char(assignment.slot_start at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
          || '–'
          || to_char(assignment.slot_end at time zone 'America/Sao_Paulo', 'HH24:MI'),
          ', ' order by assignment.slot_start
        ) as service_times
      from public.service_scale_assignments assignment
      join public.service_scale_people person on person.id = assignment.person_id
      where assignment.schedule_id = v_schedule.id
        and person.user_id is not null
      group by person.user_id
    loop
      insert into public.app_notifications (user_id, title, message, type)
      values (
        v_notice.user_id,
        'Você está na escala de alojamento',
        left(format('Sua escala em %s: %s.', v_schedule.title, v_notice.service_times), 2000),
        'service_scale'
      );
      v_notified_count := v_notified_count + 1;
    end loop;
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    'service_scale_created',
    'service_scale_schedule',
    v_schedule.id::text,
    'Escala variável criada após validação de todas as faixas horárias.',
    jsonb_build_object(
      'slot_count', v_slot_count,
      'assignment_count', jsonb_array_length(p_assignments),
      'notified_users', v_notified_count,
      'status', v_status
    )
  );

  return v_schedule;
end;
$$;

revoke all on function public.forjados_save_service_scale_v2(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.forjados_save_service_scale_v2(jsonb, jsonb, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Confirmação e contagem da inscrição por edição
-- ---------------------------------------------------------------------------

alter table public.edition_enrollments
  add column if not exists will_participate boolean,
  add column if not exists participation_responded_at timestamptz;

alter table public.retreat_participations
  add column if not exists edition_id uuid references public.forjados_editions(id) on delete set null;

create index if not exists retreat_participations_edition_id_idx
  on public.retreat_participations (edition_id)
  where edition_id is not null;

update public.retreat_participations participation
set edition_id = receipt.edition_id
from public.payment_receipts receipt
where receipt.id = participation.confirmed_by_payment_id
  and receipt.edition_id is not null
  and participation.edition_id is null;

alter table public.retreat_participations
  drop constraint if exists retreat_participations_user_id_retreat_title_key;

create unique index if not exists retreat_participations_user_edition_unique
  on public.retreat_participations (user_id, edition_id)
  where edition_id is not null;

create unique index if not exists retreat_participations_legacy_title_unique
  on public.retreat_participations (user_id, retreat_title)
  where edition_id is null;

insert into public.edition_enrollments (
  edition_id, user_id, amount, enrollment_status, payment_status,
  paid_at, approved_by, approved_at, will_participate, participation_responded_at
)
select distinct on (receipt.edition_id, receipt.user_id)
  receipt.edition_id,
  receipt.user_id,
  receipt.amount,
  case when receipt.status::text = 'approved' then 'approved' else 'pending' end,
  receipt.status::text,
  case when receipt.status::text = 'approved' then coalesce(receipt.reviewed_at, receipt.uploaded_at) else null end,
  case when receipt.status::text = 'approved' then receipt.reviewed_by else null end,
  case when receipt.status::text = 'approved' then coalesce(receipt.reviewed_at, receipt.uploaded_at) else null end,
  true,
  receipt.uploaded_at
from public.payment_receipts receipt
where receipt.type = 'inscription'
  and receipt.edition_id is not null
  and receipt.deleted_at is null
order by receipt.edition_id, receipt.user_id,
  case receipt.status::text when 'approved' then 0 when 'pending' then 1 else 2 end,
  receipt.uploaded_at desc
on conflict (edition_id, user_id) do update
set will_participate = true,
    participation_responded_at = coalesce(
      edition_enrollments.participation_responded_at,
      excluded.participation_responded_at
    ),
    updated_at = now();

update public.edition_enrollments enrollment
set will_participate = true,
    participation_responded_at = coalesce(enrollment.participation_responded_at, enrollment.created_at)
where enrollment.payment_status = 'approved'
  and enrollment.will_participate is distinct from true;

update public.profiles profile
set retreat_count = approved.approved_count,
    updated_at = now()
from (
  select receipt.user_id,
         count(distinct coalesce(receipt.edition_id::text, 'legacy:' || receipt.id::text))::integer as approved_count
  from public.payment_receipts receipt
  where receipt.type = 'inscription'
    and receipt.status::text = 'approved'
    and receipt.deleted_at is null
  group by receipt.user_id
) approved
where profile.id = approved.user_id
  and profile.retreat_count is distinct from approved.approved_count;

create or replace function public.forjados_get_my_inscription_overview_v1()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'participation_count', coalesce(
      profile.retreat_count_manual,
      (
        select count(distinct coalesce(receipt.edition_id::text, 'legacy:' || receipt.id::text))::integer
        from public.payment_receipts receipt
        where receipt.user_id = v_user_id
          and receipt.type = 'inscription'
          and receipt.status::text = 'approved'
          and receipt.deleted_at is null
      ),
      0
    ),
    'participation_count_is_manual', profile.retreat_count_manual is not null,
    'edition', case when edition.id is null then null else jsonb_build_object(
      'id', edition.id,
      'title', edition.title,
      'starts_at', edition.starts_at,
      'ends_at', edition.ends_at,
      'location', edition.location,
      'amount', edition.registration_amount,
      'status', edition.status,
      'is_active', edition.is_active
    ) end,
    'enrollment', case when enrollment.id is null then null else jsonb_build_object(
      'id', enrollment.id,
      'enrollment_status', enrollment.enrollment_status,
      'payment_status', enrollment.payment_status,
      'paid_at', enrollment.paid_at,
      'will_participate', enrollment.will_participate,
      'participation_responded_at', enrollment.participation_responded_at
    ) end
  )
  into v_result
  from public.profiles profile
  left join lateral (
    select active_edition.*
    from public.forjados_editions active_edition
    where active_edition.is_active = true
    order by active_edition.starts_at asc
    limit 1
  ) edition on true
  left join public.edition_enrollments enrollment
    on enrollment.edition_id = edition.id
   and enrollment.user_id = v_user_id
  where profile.id = v_user_id;

  return coalesce(v_result, jsonb_build_object(
    'participation_count', 0,
    'participation_count_is_manual', false,
    'edition', null,
    'enrollment', null
  ));
end;
$$;

revoke all on function public.forjados_get_my_inscription_overview_v1()
  from public, anon, authenticated;
grant execute on function public.forjados_get_my_inscription_overview_v1()
  to authenticated;

create or replace function public.forjados_set_active_edition_participation_v1(
  p_will_participate boolean
)
returns public.edition_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_edition public.forjados_editions%rowtype;
  v_enrollment public.edition_enrollments%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if p_will_participate is null then
    raise exception 'Informe se participará da próxima edição.' using errcode = '22023';
  end if;

  select * into v_edition
  from public.forjados_editions
  where is_active = true
  order by starts_at asc
  limit 1
  for update;

  if v_edition.id is null then
    raise exception 'Não existe uma edição ativa.' using errcode = '22023';
  end if;

  if p_will_participate is false and exists (
    select 1
    from public.payment_receipts receipt
    where receipt.user_id = v_user_id
      and receipt.edition_id = v_edition.id
      and receipt.type = 'inscription'
      and receipt.status::text in ('pending', 'approved')
      and receipt.deleted_at is null
  ) then
    raise exception 'Já existe pagamento ou comprovante em análise para esta edição. Procure a administração para alterar sua participação.' using errcode = '22023';
  end if;

  insert into public.edition_enrollments (
    edition_id, user_id, amount, will_participate, participation_responded_at
  ) values (
    v_edition.id, v_user_id, v_edition.registration_amount, p_will_participate, now()
  )
  on conflict (edition_id, user_id) do update
    set will_participate = excluded.will_participate,
        participation_responded_at = excluded.participation_responded_at,
        amount = case
          when edition_enrollments.payment_status in ('pending', 'rejected') then excluded.amount
          else edition_enrollments.amount
        end,
        updated_at = now()
  returning * into v_enrollment;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'edition_participation_answered',
    'edition_enrollment',
    v_enrollment.id::text,
    'Participante respondeu se irá à edição ativa.',
    jsonb_build_object('edition_id', v_edition.id, 'will_participate', p_will_participate)
  );

  return v_enrollment;
end;
$$;

revoke all on function public.forjados_set_active_edition_participation_v1(boolean)
  from public, anon, authenticated;
grant execute on function public.forjados_set_active_edition_participation_v1(boolean)
  to authenticated;

create or replace function public.forjados_save_active_edition_v2(
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text,
  p_registration_amount numeric,
  p_registration_open boolean,
  p_create_new boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_current public.forjados_editions%rowtype;
  v_previous_edition_id uuid;
  v_edition_id uuid;
begin
  if v_actor_id is null or not private.forjados_has_any_role_v1(array['admin', 'director']) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if nullif(trim(p_title), '') is null or p_starts_at is null then
    raise exception 'Nome e início são obrigatórios.' using errcode = '22023';
  end if;
  if p_ends_at is not null and p_ends_at < p_starts_at then
    raise exception 'A data final não pode ser anterior ao início.' using errcode = '22023';
  end if;
  if p_registration_amount is null or p_registration_amount < 0 then
    raise exception 'Valor de inscrição inválido.' using errcode = '22023';
  end if;

  select * into v_current
  from public.forjados_editions
  where is_active = true
  order by starts_at asc
  limit 1
  for update;

  if coalesce(p_create_new, false) and v_current.id is not null then
    if p_starts_at <= v_current.starts_at then
      raise exception 'A próxima edição precisa começar depois da edição atual.' using errcode = '22023';
    end if;

    v_previous_edition_id := v_current.id;

    update public.forjados_editions
    set is_active = false,
        status = case when coalesce(v_current.ends_at, v_current.starts_at) < now() then 'finished' else 'closed' end,
        updated_at = now()
    where id = v_current.id;

    v_current.id := null;
  end if;

  if v_current.id is null then
    insert into public.forjados_editions (
      title, starts_at, ends_at, registration_amount, status,
      is_active, location, created_by
    ) values (
      left(trim(p_title), 160), p_starts_at, p_ends_at,
      round(p_registration_amount, 2),
      case when coalesce(p_registration_open, false) then 'open' else 'closed' end,
      true, left(coalesce(p_location, ''), 255), v_actor_id
    ) returning id into v_edition_id;
  else
    v_edition_id := v_current.id;
    update public.forjados_editions
    set title = left(trim(p_title), 160),
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        registration_amount = round(p_registration_amount, 2),
        status = case when coalesce(p_registration_open, false) then 'open' else 'closed' end,
        location = left(coalesce(p_location, ''), 255),
        updated_at = now()
    where id = v_edition_id;

    update public.edition_enrollments
    set amount = round(p_registration_amount, 2), updated_at = now()
    where edition_id = v_edition_id
      and payment_status in ('pending', 'rejected');
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    case when coalesce(p_create_new, false) then 'edition_created' else 'active_edition_updated' end,
    'forjados_edition',
    v_edition_id::text,
    case when coalesce(p_create_new, false)
      then 'Nova edição criada; histórico e pagamentos da edição anterior foram preservados.'
      else 'Configuração da edição ativa atualizada.'
    end,
    jsonb_build_object(
      'previous_edition_id', v_previous_edition_id,
      'registration_amount', round(p_registration_amount, 2),
      'registration_open', coalesce(p_registration_open, false),
      'create_new', coalesce(p_create_new, false)
    )
  );

  return v_edition_id;
end;
$$;

revoke all on function public.forjados_save_active_edition_v2(text, timestamptz, timestamptz, text, numeric, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.forjados_save_active_edition_v2(text, timestamptz, timestamptz, text, numeric, boolean, boolean)
  to authenticated;

-- Exigir a confirmação da participação antes de aceitar o comprovante.
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
  v_edition_id uuid;
  v_amount numeric(10,2);
  v_edition_status text;
  v_receipt_id uuid;
  v_user_name text;
  v_user_email text;
  v_user_whatsapp text;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;

  select edition.id, edition.registration_amount, edition.status
  into v_edition_id, v_amount, v_edition_status
  from public.forjados_editions edition
  where edition.is_active = true
  order by edition.starts_at asc
  limit 1;

  if v_edition_id is null then raise exception 'Não existe uma edição ativa.'; end if;
  if v_edition_status <> 'open' then raise exception 'As inscrições desta edição estão fechadas.'; end if;
  if not exists (
    select 1 from public.edition_enrollments enrollment
    where enrollment.edition_id = v_edition_id
      and enrollment.user_id = v_user_id
      and enrollment.will_participate is true
  ) then
    raise exception 'Confirme sua participação nesta edição antes de enviar o comprovante.';
  end if;
  if p_file_path is null or p_file_path not like (
    v_user_id::text || '/inscricoes/' || v_edition_id::text || '/%'
  ) then raise exception 'Caminho de comprovante inválido.'; end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'payment-receipts' and object.name = p_file_path
  ) then raise exception 'O arquivo enviado não foi encontrado.'; end if;
  if exists (
    select 1 from public.payment_receipts receipt
    where receipt.user_id = v_user_id
      and receipt.edition_id = v_edition_id
      and receipt.type = 'inscription'
      and receipt.status::text in ('pending', 'approved')
      and receipt.deleted_at is null
  ) then raise exception 'Já existe um comprovante válido ou em análise para esta edição.'; end if;

  update public.edition_enrollments
  set amount = case when payment_status in ('pending', 'rejected') then v_amount else amount end,
      updated_at = now()
  where edition_id = v_edition_id and user_id = v_user_id;

  select
    coalesce(nullif(profile.display_name, ''), nullif(p_user_name, ''), 'Participante'),
    coalesce(nullif(profile.email, ''), nullif(p_user_email, ''), auth_user.email, ''),
    coalesce(nullif(profile.phone, ''), p_user_whatsapp, '')
  into v_user_name, v_user_email, v_user_whatsapp
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = v_user_id;

  insert into public.payment_receipts (
    user_id, user_name, user_email, user_whatsapp, amount,
    file_url, file_path, file_name, file_type, status, type, edition_id
  ) values (
    v_user_id, v_user_name, v_user_email, v_user_whatsapp, v_amount,
    '', p_file_path, left(coalesce(p_file_name, 'comprovante'), 255),
    left(coalesce(p_file_type, 'arquivo'), 120),
    'pending'::public.receipt_status, 'inscription', v_edition_id
  ) returning id into v_receipt_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id, 'inscription_receipt_submitted', 'payment_receipt', v_receipt_id::text,
    'Comprovante de inscrição enviado.',
    jsonb_build_object('edition_id', v_edition_id, 'amount', v_amount)
  );

  return v_receipt_id;
end;
$$;

revoke all on function public.forjados_submit_inscription_receipt_v1(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.forjados_submit_inscription_receipt_v1(text, text, text, text, text, text)
  to authenticated;

-- Manter a contagem automática baseada em pagamentos aprovados por edição.
create or replace function public.forjados_confirm_participation_from_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retreat_title text;
begin
  if new.status::text = 'approved'
    and new.type = 'inscription'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then

    if new.edition_id is not null then
      select edition.title into v_retreat_title
      from public.forjados_editions edition where edition.id = new.edition_id;

      insert into public.retreat_participations (
        user_id, retreat_title, edition_id, confirmed_by_payment_id, confirmed_by, confirmed_at
      ) values (
        new.user_id, coalesce(v_retreat_title, 'FORJADOS'), new.edition_id,
        new.id, new.reviewed_by, now()
      )
      on conflict (user_id, edition_id) where edition_id is not null do update
        set retreat_title = excluded.retreat_title,
            confirmed_by_payment_id = excluded.confirmed_by_payment_id,
            confirmed_by = excluded.confirmed_by,
            confirmed_at = excluded.confirmed_at;
    else
      v_retreat_title := coalesce(v_retreat_title, 'FORJADOS');
      insert into public.retreat_participations (
        user_id, retreat_title, confirmed_by_payment_id, confirmed_by, confirmed_at
      ) values (
        new.user_id, v_retreat_title, new.id, new.reviewed_by, now()
      )
      on conflict (user_id, retreat_title) where edition_id is null do update
        set confirmed_by_payment_id = excluded.confirmed_by_payment_id,
            confirmed_by = excluded.confirmed_by,
            confirmed_at = excluded.confirmed_at;
    end if;

    update public.profiles profile
    set retreat_count = (
          select count(distinct coalesce(receipt.edition_id::text, 'legacy:' || receipt.id::text))::integer
          from public.payment_receipts receipt
          where receipt.user_id = new.user_id
            and receipt.type = 'inscription'
            and receipt.status::text = 'approved'
            and receipt.deleted_at is null
        ),
        updated_at = now()
    where profile.id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.forjados_confirm_participation_from_payment()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
