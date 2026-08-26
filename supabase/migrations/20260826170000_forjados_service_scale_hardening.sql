-- FORJADOS — geração e persistência segura da escala de serviço.
-- A função valida a escala inteira antes de criar qualquer registro, evitando
-- escalas publicadas sem alocações ou com pessoas inválidas.

begin;

create or replace function public.forjados_save_service_scale_v1(
  p_config jsonb,
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
  v_men_per_shift integer;
  v_women_per_shift integer;
  v_min_rest_minutes integer;
  v_avoid_consecutive boolean;
  v_status text;
  v_slot_count integer;
  v_min_slot integer;
  v_max_slot integer;
begin
  if v_actor_id is null or not (select public.can_manage_service_scale()) then
    raise exception 'Acesso negado para gerenciar a escala.' using errcode = '42501';
  end if;

  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Configuração da escala inválida.' using errcode = '22023';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array'
    or jsonb_array_length(p_assignments) = 0 then
    raise exception 'A escala precisa ter pelo menos uma alocação.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_assignments) as item(value)
    where jsonb_typeof(item.value) <> 'object'
  ) then
    raise exception 'As alocações da escala estão inválidas.' using errcode = '22023';
  end if;

  begin
    v_title := nullif(trim(p_config->>'title'), '');
    v_start_at := nullif(p_config->>'start_at', '')::timestamptz;
    v_end_at := nullif(p_config->>'end_at', '')::timestamptz;
    v_shift_minutes := nullif(p_config->>'shift_minutes', '')::integer;
    v_men_per_shift := nullif(p_config->>'men_per_shift', '')::integer;
    v_women_per_shift := nullif(p_config->>'women_per_shift', '')::integer;
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
  if v_shift_minutes < 15 or v_shift_minutes > 720 then
    raise exception 'A duração do serviço deve ficar entre 15 minutos e 12 horas.' using errcode = '22023';
  end if;
  if v_men_per_shift < 0 or v_women_per_shift < 0
    or v_men_per_shift + v_women_per_shift < 1 then
    raise exception 'A quantidade de pessoas por turno é inválida.' using errcode = '22023';
  end if;
  if v_min_rest_minutes < 0 or v_min_rest_minutes > 1440 then
    raise exception 'O descanso mínimo deve ficar entre 0 e 1.440 minutos.' using errcode = '22023';
  end if;
  if v_status not in ('draft', 'published') then
    raise exception 'Status da escala inválido.' using errcode = '22023';
  end if;

  select
    count(distinct assignment.slot_number)::integer,
    min(assignment.slot_number),
    max(assignment.slot_number)
  into v_slot_count, v_min_slot, v_max_slot
  from jsonb_to_recordset(p_assignments) as assignment(
    person_id uuid,
    gender text,
    slot_number integer,
    slot_start timestamptz,
    slot_end timestamptz,
    accommodation text
  );

  if v_min_slot is distinct from 1 or v_max_slot is distinct from v_slot_count then
    raise exception 'Os turnos da escala precisam ser sequenciais.' using errcode = '22023';
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
    where assignment.person_id is null
      or assignment.gender not in ('male', 'female')
      or assignment.accommodation not in ('male', 'female')
      or assignment.gender <> assignment.accommodation
      or assignment.slot_number is null
      or assignment.slot_number < 1
      or assignment.slot_start is null
      or assignment.slot_end is null
      or assignment.slot_start >= assignment.slot_end
      or assignment.slot_start < v_start_at
      or assignment.slot_end > v_end_at
  ) then
    raise exception 'Há uma alocação com dados incompatíveis com a escala.' using errcode = '22023';
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
    raise exception 'Uma pessoa não pode aparecer duas vezes no mesmo turno.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select assignment.slot_number
      from jsonb_to_recordset(p_assignments) as assignment(
        person_id uuid,
        gender text,
        slot_number integer,
        slot_start timestamptz,
        slot_end timestamptz,
        accommodation text
      )
      group by assignment.slot_number
      having count(*) filter (where assignment.accommodation = 'male') <> v_men_per_shift
          or count(*) filter (where assignment.accommodation = 'female') <> v_women_per_shift
          or count(distinct assignment.slot_start) <> 1
          or count(distinct assignment.slot_end) <> 1
    ) as invalid_slots
  ) then
    raise exception 'Cada turno precisa ter exatamente as vagas configuradas.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select assignment.slot_number, min(assignment.slot_start) as slot_start, max(assignment.slot_end) as slot_end
      from jsonb_to_recordset(p_assignments) as assignment(
        person_id uuid,
        gender text,
        slot_number integer,
        slot_start timestamptz,
        slot_end timestamptz,
        accommodation text
      )
      group by assignment.slot_number
    ) as slots
    where slots.slot_end - slots.slot_start > make_interval(mins => v_shift_minutes)
  ) then
    raise exception 'A duração de um turno excede a configuração informada.' using errcode = '22023';
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
    raise exception 'A escala contém uma pessoa inexistente, inativa, em trilha ou sem alojamento compatível.' using errcode = '22023';
  end if;

  insert into public.service_scale_schedules (
    title, start_at, end_at, shift_minutes, men_per_shift, women_per_shift,
    min_rest_minutes, avoid_consecutive, status, created_by
  ) values (
    left(v_title, 160), v_start_at, v_end_at, v_shift_minutes, v_men_per_shift,
    v_women_per_shift, v_min_rest_minutes, v_avoid_consecutive, v_status, v_actor_id
  ) returning * into v_schedule;

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

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    'service_scale_created',
    'service_scale_schedule',
    v_schedule.id::text,
    'Escala de serviço criada após validação de todos os turnos.',
    jsonb_build_object(
      'slot_count', v_slot_count,
      'assignment_count', jsonb_array_length(p_assignments),
      'status', v_status
    )
  );

  return v_schedule;
end;
$$;

revoke all on function public.forjados_save_service_scale_v1(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.forjados_save_service_scale_v1(jsonb, jsonb)
  to authenticated;

notify pgrst, 'reload schema';

commit;
