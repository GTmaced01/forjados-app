-- Integra o gerador de Escala de Serviço às escalas operacionais exibidas
-- na aba Serviços, preservando o histórico e a validação do gerador atual.

alter table public.service_scale_schedules
  add column if not exists edition_id uuid references public.forjados_editions(id) on delete set null,
  add column if not exists service_unit_id uuid references public.event_service_units(id) on delete set null,
  add column if not exists scale_type text not null default 'accommodation';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.service_scale_schedules'::regclass
      and conname = 'service_scale_schedules_scale_type_check'
  ) then
    alter table public.service_scale_schedules
      add constraint service_scale_schedules_scale_type_check
      check (scale_type in ('accommodation', 'main_gate'));
  end if;
end;
$$;

create index if not exists service_scale_schedules_edition_type_idx
  on public.service_scale_schedules (edition_id, scale_type, start_at)
  where deleted_at is null and status = 'published';

-- Escalas antigas eram exclusivamente de alojamento. Vincula-as à edição
-- ativa para que também apareçam em Serviços sem perder o histórico.
with active_edition as (
  select edition.id
  from public.forjados_editions edition
  where edition.is_active is true
  order by edition.starts_at asc
  limit 1
)
update public.service_scale_schedules schedule
set edition_id = active_edition.id,
    scale_type = 'accommodation'
from active_edition
where schedule.edition_id is null;

update public.service_scale_schedules schedule
set service_unit_id = unit.id
from public.event_service_units unit
where schedule.service_unit_id is null
  and schedule.edition_id = unit.edition_id
  and unit.unit_type = 'scale'
  and unit.name = case schedule.scale_type
    when 'main_gate' then 'Escala Portão Principal'
    else 'Escala Alojamento'
  end;

create or replace function public.forjados_save_service_scale_v3(
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
  v_edition_id uuid;
  v_service_unit_id uuid;
  v_scale_type text;
  v_scale_name text;
  v_requested_status text;
  v_notified_count integer := 0;
  v_notice record;
begin
  if v_actor_id is null or not (select public.can_manage_service_scale()) then
    raise exception 'Acesso negado para gerenciar a escala.' using errcode = '42501';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Configuração da escala inválida.' using errcode = '22023';
  end if;

  v_scale_type := coalesce(nullif(p_config ->> 'scale_type', ''), 'accommodation');
  v_requested_status := coalesce(nullif(p_config ->> 'status', ''), 'published');
  if v_scale_type not in ('accommodation', 'main_gate') then
    raise exception 'Escolha Alojamento ou Portão Principal.' using errcode = '22023';
  end if;
  if v_requested_status not in ('draft', 'published') then
    raise exception 'Status da escala inválido.' using errcode = '22023';
  end if;

  select edition.id
  into v_edition_id
  from public.forjados_editions edition
  where edition.is_active is true
  order by edition.starts_at asc
  limit 1;

  if v_edition_id is null then
    raise exception 'Não há uma edição ativa para receber esta escala.' using errcode = '22023';
  end if;

  v_scale_name := case v_scale_type
    when 'main_gate' then 'Escala Portão Principal'
    else 'Escala Alojamento'
  end;

  select unit.id
  into v_service_unit_id
  from public.event_service_units unit
  where unit.edition_id = v_edition_id
    and unit.unit_type = 'scale'
    and unit.name = v_scale_name
    and unit.is_active is true
  limit 1;

  if v_service_unit_id is null then
    perform private.forjados_seed_event_services_v1(v_edition_id);
    select unit.id
    into v_service_unit_id
    from public.event_service_units unit
    where unit.edition_id = v_edition_id
      and unit.unit_type = 'scale'
      and unit.name = v_scale_name
      and unit.is_active is true
    limit 1;
  end if;

  if v_service_unit_id is null then
    raise exception 'A escala operacional % não está configurada nesta edição.', v_scale_name using errcode = '22023';
  end if;

  -- Salva primeiro como rascunho usando toda a validação consolidada da v2.
  -- Assim a v2 não dispara a notificação fixa de alojamento; a mensagem correta
  -- é criada abaixo depois que o tipo escolhido estiver vinculado.
  v_schedule := public.forjados_save_service_scale_v2(
    p_config || jsonb_build_object('status', 'draft'),
    p_slots,
    p_assignments
  );

  update public.service_scale_schedules schedule
  set edition_id = v_edition_id,
      service_unit_id = v_service_unit_id,
      scale_type = v_scale_type,
      status = v_requested_status,
      updated_at = now()
  where schedule.id = v_schedule.id
  returning * into v_schedule;

  if v_requested_status = 'published' then
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
        left('Você está na ' || v_scale_name, 160),
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
    'service_scale_published_to_services',
    'service_scale_schedule',
    v_schedule.id::text,
    'Escala de serviço vinculada automaticamente à aba Serviços.',
    jsonb_build_object(
      'edition_id', v_edition_id,
      'service_unit_id', v_service_unit_id,
      'scale_type', v_scale_type,
      'status', v_requested_status,
      'notified_users', v_notified_count
    )
  );

  return v_schedule;
end;
$$;

revoke all on function public.forjados_save_service_scale_v3(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.forjados_save_service_scale_v3(jsonb, jsonb, jsonb)
  to authenticated;

create or replace function public.forjados_list_published_service_scales_v1(
  p_edition_id uuid default null
)
returns table (
  schedule_id uuid,
  schedule_title text,
  scale_type text,
  service_unit_id uuid,
  assignment_id uuid,
  user_id uuid,
  person_name text,
  gender text,
  slot_number integer,
  slot_start timestamptz,
  slot_end timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_edition_id uuid := p_edition_id;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  if v_edition_id is null then
    select edition.id
    into v_edition_id
    from public.forjados_editions edition
    where edition.is_active is true
    order by edition.starts_at asc
    limit 1;
  end if;

  return query
  select
    schedule.id,
    schedule.title,
    schedule.scale_type,
    schedule.service_unit_id,
    assignment.id,
    person.user_id,
    assignment.person_name,
    assignment.gender,
    assignment.slot_number,
    assignment.slot_start,
    assignment.slot_end
  from public.service_scale_schedules schedule
  join public.service_scale_assignments assignment
    on assignment.schedule_id = schedule.id
  left join public.service_scale_people person
    on person.id = assignment.person_id
  where schedule.edition_id = v_edition_id
    and schedule.status = 'published'
    and schedule.deleted_at is null
  order by schedule.scale_type, schedule.start_at, assignment.slot_number, assignment.person_name;
end;
$$;

revoke all on function public.forjados_list_published_service_scales_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.forjados_list_published_service_scales_v1(uuid)
  to authenticated;

comment on column public.service_scale_schedules.scale_type is
  'Destino da escala: accommodation (Alojamento) ou main_gate (Portão Principal).';
comment on column public.service_scale_schedules.service_unit_id is
  'Escala operacional correspondente exibida na aba Serviços.';
comment on function public.forjados_list_published_service_scales_v1(uuid) is
  'Retorna somente os campos seguros das escalas publicadas para exibição aos usuários autenticados.';
