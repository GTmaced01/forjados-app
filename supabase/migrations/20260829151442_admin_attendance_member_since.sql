-- Corrige a presença administrativa da edição ativa e permite que Admin altere
-- a data "Membro desde" sem liberar esse campo para o próprio participante.

create or replace function public.forjados_list_attendance_v2(
  p_edition_id uuid default null
)
returns table(
  participation_id uuid,
  enrollment_id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  edition_id uuid,
  retreat_title text,
  attendance_status text,
  attendance_notes text,
  attendance_updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_edition_id uuid := p_edition_id;
begin
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem consultar presença.'
      using errcode = '42501';
  end if;

  if v_edition_id is null then
    select edition.id
    into v_edition_id
    from public.forjados_editions edition
    where edition.is_active is true
    order by edition.starts_at asc
    limit 1;
  end if;

  if v_edition_id is null then
    return;
  end if;

  return query
  select
    participation.id,
    enrollment.id,
    profile.id,
    coalesce(nullif(profile.display_name, ''), profile.email),
    profile.email,
    edition.id,
    edition.title,
    coalesce(participation.attendance_status, 'confirmed'),
    coalesce(participation.attendance_notes, ''),
    participation.attendance_updated_at
  from public.edition_enrollments enrollment
  join public.forjados_editions edition
    on edition.id = enrollment.edition_id
  join public.profiles profile
    on profile.id = enrollment.user_id
  left join public.retreat_participations participation
    on participation.edition_id = enrollment.edition_id
   and participation.user_id = enrollment.user_id
  where enrollment.edition_id = v_edition_id
    and enrollment.will_participate is true
    and profile.is_deleted is false
  order by coalesce(nullif(profile.display_name, ''), profile.email);
end;
$$;

create or replace function public.forjados_update_attendance_v2(
  p_user_id uuid,
  p_edition_id uuid,
  p_attendance_status text,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_edition_title text;
  v_previous_status text := 'confirmed';
  v_participation_id uuid;
  v_notes text := nullif(left(trim(coalesce(p_notes, '')), 1000), '');
begin
  if not (select private.forjados_has_any_role_v1(array['admin'])) then
    raise exception 'Apenas Administradores podem alterar a presença.'
      using errcode = '42501';
  end if;

  if p_user_id is null or p_edition_id is null then
    raise exception 'Participante e edição são obrigatórios.'
      using errcode = '22023';
  end if;

  if p_attendance_status not in ('confirmed', 'present', 'absent', 'excused') then
    raise exception 'Status de presença inválido.'
      using errcode = '22023';
  end if;

  select edition.title
  into v_edition_title
  from public.forjados_editions edition
  where edition.id = p_edition_id;

  if not found then
    raise exception 'Edição não encontrada.'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and profile.is_deleted is false
  ) then
    raise exception 'Participante não encontrado.'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.edition_enrollments enrollment
    where enrollment.edition_id = p_edition_id
      and enrollment.user_id = p_user_id
      and enrollment.will_participate is true
  ) and not exists (
    select 1
    from public.retreat_participations participation
    where participation.edition_id = p_edition_id
      and participation.user_id = p_user_id
  ) then
    raise exception 'O participante não confirmou presença nesta edição.'
      using errcode = '22023';
  end if;

  select participation.attendance_status
  into v_previous_status
  from public.retreat_participations participation
  where participation.edition_id = p_edition_id
    and participation.user_id = p_user_id;

  v_previous_status := coalesce(v_previous_status, 'confirmed');

  insert into public.retreat_participations as participation (
    user_id,
    edition_id,
    retreat_title,
    confirmed_by,
    attendance_status,
    attendance_notes,
    attendance_updated_by,
    attendance_updated_at
  )
  values (
    p_user_id,
    p_edition_id,
    v_edition_title,
    v_actor_id,
    p_attendance_status,
    v_notes,
    v_actor_id,
    now()
  )
  on conflict (user_id, edition_id)
    where edition_id is not null
  do update
    set attendance_status = excluded.attendance_status,
        attendance_notes = excluded.attendance_notes,
        attendance_updated_by = excluded.attendance_updated_by,
        attendance_updated_at = excluded.attendance_updated_at
  returning participation.id into v_participation_id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  )
  values (
    v_actor_id,
    'attendance.updated',
    'retreat_participation',
    v_participation_id::text,
    'Status de presença alterado manualmente.',
    jsonb_build_object(
      'user_id', p_user_id,
      'edition_id', p_edition_id,
      'previous_status', v_previous_status,
      'status', p_attendance_status,
      'notes', v_notes
    )
  );
end;
$$;

create or replace function public.forjados_admin_update_member_since_v1(
  p_user_id uuid,
  p_member_since date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_previous_member_since date;
begin
  if not (select private.forjados_has_any_role_v1(array['admin'])) then
    raise exception 'Apenas Administradores podem alterar a data de membro.'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Participante é obrigatório.'
      using errcode = '22023';
  end if;

  if p_member_since > current_date then
    raise exception 'A data de membro não pode estar no futuro.'
      using errcode = '22023';
  end if;

  select profile.member_since
  into v_previous_member_since
  from public.profiles profile
  where profile.id = p_user_id
    and profile.is_deleted is false;

  if not found then
    raise exception 'Participante não encontrado.'
      using errcode = 'P0002';
  end if;

  update public.profiles profile
  set member_since = p_member_since,
      updated_at = now()
  where profile.id = p_user_id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  )
  values (
    v_actor_id,
    'profile.member_since.updated',
    'profile',
    p_user_id::text,
    'Data de membro alterada pelo Administrador.',
    jsonb_build_object(
      'previous_member_since', v_previous_member_since,
      'member_since', p_member_since
    )
  );
end;
$$;

revoke all on function public.forjados_list_attendance_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.forjados_update_attendance_v2(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.forjados_admin_update_member_since_v1(uuid, date)
  from public, anon, authenticated;

grant execute on function public.forjados_list_attendance_v2(uuid)
  to authenticated;
grant execute on function public.forjados_update_attendance_v2(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.forjados_admin_update_member_since_v1(uuid, date)
  to authenticated;

comment on function public.forjados_list_attendance_v2(uuid)
  is 'Lista confirmações da edição para controle administrativo de presença física.';
comment on function public.forjados_update_attendance_v2(uuid, uuid, text, text)
  is 'Registra presença física manualmente, inclusive antes da confirmação financeira.';
comment on function public.forjados_admin_update_member_since_v1(uuid, date)
  is 'Permite ao Administrador corrigir a data Membro desde com trilha de auditoria.';
