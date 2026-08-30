-- Mantém as RPCs expostas como SECURITY INVOKER e move a implementação
-- privilegiada para o schema privado, fora da Data API.

revoke all on function public.forjados_save_service_scale_v3(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.forjados_list_published_service_scales_v1(uuid)
  from public, anon, authenticated;

alter function public.forjados_save_service_scale_v3(jsonb, jsonb, jsonb)
  set schema private;
alter function public.forjados_list_published_service_scales_v1(uuid)
  set schema private;

revoke all on function private.forjados_save_service_scale_v3(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.forjados_list_published_service_scales_v1(uuid)
  from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.forjados_save_service_scale_v3(jsonb, jsonb, jsonb)
  to authenticated;
grant execute on function private.forjados_list_published_service_scales_v1(uuid)
  to authenticated;

create function public.forjados_save_service_scale_v3(
  p_config jsonb,
  p_slots jsonb,
  p_assignments jsonb
)
returns public.service_scale_schedules
language sql
security invoker
set search_path = ''
as $$
  select private.forjados_save_service_scale_v3(p_config, p_slots, p_assignments);
$$;

create function public.forjados_list_published_service_scales_v1(
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
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.forjados_list_published_service_scales_v1(p_edition_id);
$$;

revoke all on function public.forjados_save_service_scale_v3(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.forjados_save_service_scale_v3(jsonb, jsonb, jsonb)
  to authenticated;

revoke all on function public.forjados_list_published_service_scales_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.forjados_list_published_service_scales_v1(uuid)
  to authenticated;

comment on function public.forjados_save_service_scale_v3(jsonb, jsonb, jsonb) is
  'Wrapper SECURITY INVOKER para a implementação validada no schema privado.';
comment on function public.forjados_list_published_service_scales_v1(uuid) is
  'Wrapper SECURITY INVOKER que expõe apenas o resumo seguro das escalas publicadas.';
