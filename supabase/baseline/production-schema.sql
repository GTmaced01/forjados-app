


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."inscription_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."inscription_status" OWNER TO "postgres";


CREATE TYPE "public"."order_status" AS ENUM (
    'cart',
    'waiting_payment',
    'receipt_sent',
    'payment_approved',
    'payment_rejected',
    'delivered',
    'cancelled'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."receipt_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."receipt_status" OWNER TO "postgres";


CREATE TYPE "public"."redemption_status" AS ENUM (
    'requested',
    'approved',
    'rejected',
    'delivered',
    'cancelled'
);


ALTER TYPE "public"."redemption_status" OWNER TO "postgres";


CREATE TYPE "public"."ride_status" AS ENUM (
    'available',
    'full',
    'cancelled',
    'confirmed',
    'completed',
    'not_completed'
);


ALTER TYPE "public"."ride_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'member',
    'leader',
    'director',
    'treasury',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_audit_event_service_change_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id text := coalesce(v_row ->> 'id', '');
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, description, metadata)
  values (
    (select auth.uid()),
    'event_service.' || lower(tg_op),
    tg_table_name,
    v_id,
    format('OperaÃ§Ã£o do evento: %s em %s.', lower(tg_op), tg_table_name),
    jsonb_build_object('record', v_row)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_audit_event_service_change_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_audit_material_item_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_action text;
  v_actor_name text;
begin
  v_action := case
    when tg_op = 'INSERT' then 'created'
    when old.is_archived is false and new.is_archived is true then 'archived'
    when old.is_archived is true and new.is_archived is false then 'restored'
    else 'updated'
  end;

  select coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email, 'UsuÃ¡rio')
    into v_actor_name
  from public.profiles profile
  where profile.id = (select auth.uid());

  insert into public.material_item_history (
    item_id, edition_id, sector_unit_id, action, before_data, after_data, created_by, created_by_name
  ) values (
    new.id,
    new.edition_id,
    new.sector_unit_id,
    v_action,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    (select auth.uid()), coalesce(v_actor_name, 'Sistema')
  );

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    (select auth.uid()),
    'material.' || v_action,
    'material_items',
    new.id::text,
    format('Material %s: %s.', v_action, new.name),
    jsonb_build_object('before', case when tg_op = 'INSERT' then null else to_jsonb(old) end, 'after', to_jsonb(new))
  );

  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_audit_material_item_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_can_access_material_image_v1"("p_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_edition_id uuid;
  v_sector_id uuid;
  v_item_id uuid;
begin
  if coalesce(array_length(v_parts, 1), 0) <> 4 then return false; end if;
  v_edition_id := v_parts[1]::uuid;
  v_sector_id := v_parts[2]::uuid;
  v_item_id := v_parts[3]::uuid;

  return private.forjados_can_manage_material_sector_v1(v_edition_id, v_sector_id)
    and exists (
      select 1 from public.material_items item
      where item.id = v_item_id
        and item.edition_id = v_edition_id
        and item.sector_unit_id = v_sector_id
    );
exception when invalid_text_representation then
  return false;
end;
$$;


ALTER FUNCTION "private"."forjados_can_access_material_image_v1"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_can_manage_event_service_unit_v1"("p_unit_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    (select private.forjados_has_any_role_v1(array['admin', 'director']))
    or exists (
      select 1
      from public.event_service_assignments assignment
      join public.event_service_units unit on unit.id = assignment.unit_id
      where assignment.unit_id = p_unit_id
        and assignment.user_id = (select auth.uid())
        and assignment.is_leader is true
        and unit.unit_type = 'sector'
        and unit.is_active is true
    );
$$;


ALTER FUNCTION "private"."forjados_can_manage_event_service_unit_v1"("p_unit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_can_manage_material_sector_v1"("p_edition_id" "uuid", "p_sector_unit_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    (select private.forjados_has_any_role_v1(array['admin', 'director']))
    or exists (
      select 1
      from public.event_service_assignments assignment
      join public.event_service_units unit
        on unit.id = assignment.unit_id
       and unit.edition_id = assignment.edition_id
      join public.forjados_editions edition on edition.id = assignment.edition_id
      where assignment.user_id = (select auth.uid())
        and assignment.is_leader is true
        and assignment.edition_id = p_edition_id
        and assignment.unit_id = p_sector_unit_id
        and unit.unit_type = 'sector'
        and unit.is_active is true
        and edition.is_active is true
    );
$$;


ALTER FUNCTION "private"."forjados_can_manage_material_sector_v1"("p_edition_id" "uuid", "p_sector_unit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_clear_previous_primary_sector_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_unit public.event_service_units%rowtype;
begin
  if new.user_id is null or new.is_primary is not true then
    return new;
  end if;

  select * into v_unit
  from public.event_service_units
  where id = new.unit_id;

  if not found or v_unit.unit_type <> 'sector' then
    return new;
  end if;

  update public.event_service_assignments assignment
  set is_primary = false,
      updated_at = now()
  where assignment.edition_id = v_unit.edition_id
    and assignment.user_id = new.user_id
    and assignment.is_primary is true
    and assignment.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_clear_previous_primary_sector_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_handle_schedule_change_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_action text;
begin
  v_action := case
    when tg_op = 'INSERT' then 'schedule_item_created'
    when new.deleted_at is not null and old.deleted_at is null then 'schedule_item_archived'
    when new.is_published = true and old.is_published = false then 'schedule_item_published'
    else 'schedule_item_updated'
  end;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    (select auth.uid()),
    v_action,
    'event_schedule_item',
    new.id::text,
    format('Cronograma: %s.', new.title),
    jsonb_build_object(
      'edition_id', new.edition_id,
      'starts_at', new.starts_at,
      'is_published', new.is_published
    )
  );

  if new.is_published = true
     and new.deleted_at is null
     and (tg_op = 'INSERT' or old.is_published = false) then
    insert into public.app_notifications (user_id, title, message, type)
    select
      profile.id,
      'Cronograma atualizado',
      format('â€œ%sâ€ foi adicionada Ã  programaÃ§Ã£o. Consulte o Cronograma.', new.title),
      'schedule_published'
    from public.profiles profile
    where coalesce(profile.is_deleted, false) = false
      and profile.inscription_status::text = 'approved';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_handle_schedule_change_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_has_any_role_v1"("p_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and coalesce(profile.is_deleted, false) = false
      and (
        coalesce(profile.is_admin, false)
        or profile.role::text = any(p_roles)
      )
  );
$$;


ALTER FUNCTION "private"."forjados_has_any_role_v1"("p_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("schedule_id" "uuid", "schedule_title" "text", "scale_type" "text", "service_unit_id" "uuid", "assignment_id" "uuid", "user_id" "uuid", "person_name" "text", "gender" "text", "slot_number" integer, "slot_start" timestamp with time zone, "slot_end" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_edition_id uuid := p_edition_id;
begin
  if (select auth.uid()) is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '28000';
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


ALTER FUNCTION "private"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid") IS 'Retorna somente os campos seguros das escalas publicadas para exibiÃ§Ã£o aos usuÃ¡rios autenticados.';



CREATE OR REPLACE FUNCTION "private"."forjados_notify_management_on_action_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_actor_name text := 'Um participante';
  v_title text;
  v_message text;
  v_type text;
begin
  if tg_table_name = 'shirt_orders' then
    select coalesce(nullif(profile.display_name, ''), profile.email, v_actor_name)
      into v_actor_name
    from public.profiles profile
    where profile.id = new.user_id;
    v_title := 'Novo pedido na Loja de Camisas';
    v_message := format('%s criou um pedido no valor de R$ %s.', v_actor_name, new.total_price);
    v_type := 'shirt_order_created';
  elsif tg_table_name = 'points_redemptions' then
    v_actor_name := coalesce(nullif(new.user_name, ''), v_actor_name);
    v_title := 'Novo resgate na Loja de Honra';
    v_message := format('%s resgatou â€œ%sâ€ por %s pontos.', v_actor_name, new.product_name, new.points_cost);
    v_type := 'points_redemption_created';
  elsif tg_table_name = 'offers' then
    v_actor_name := coalesce(nullif(new.user_name, ''), v_actor_name);
    v_title := 'Nova oferta registrada';
    v_message := format('%s registrou uma oferta de R$ %s para %s.', v_actor_name, new.amount, new.objective);
    v_type := 'offer_created';
  elsif tg_table_name = 'payment_receipts' then
    v_actor_name := coalesce(nullif(new.user_name, ''), v_actor_name);
    v_title := case when new.type = 'shirt_order'
      then 'Novo comprovante de pedido'
      else 'Novo comprovante de inscriÃ§Ã£o'
    end;
    v_message := format('%s enviou um comprovante para anÃ¡lise.', v_actor_name);
    v_type := 'payment_receipt_created';
  else
    return new;
  end if;

  insert into public.app_notifications (user_id, title, message, type)
  select profile.id, v_title, v_message, v_type
  from public.profiles profile
  where coalesce(profile.is_deleted, false) = false
    and profile.inscription_status::text = 'approved'
    and (coalesce(profile.is_admin, false) or profile.role::text in ('admin', 'director'));

  return new;
end;
$_$;


ALTER FUNCTION "private"."forjados_notify_management_on_action_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_prepare_event_service_assignment_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_unit public.event_service_units%rowtype;
  v_character public.event_service_units%rowtype;
  v_group public.event_service_units%rowtype;
  v_position_unit uuid;
  v_character_count integer;
begin
  select * into v_unit from public.event_service_units where id = new.unit_id;
  if not found then raise exception 'FunÃ§Ã£o operacional nÃ£o encontrada.'; end if;
  new.edition_id := v_unit.edition_id;

  if new.position_id is not null then
    select position.unit_id into v_position_unit
    from public.event_service_positions position
    where position.id = new.position_id;
    if v_position_unit is distinct from new.unit_id then
      raise exception 'A funÃ§Ã£o escolhida nÃ£o pertence a este setor/oficina.';
    end if;
  end if;

  if new.linked_character_id is not null then
    select * into v_character from public.event_service_units where id = new.linked_character_id;
    if not found or v_character.edition_id <> v_unit.edition_id or v_character.unit_type <> 'character' then
      raise exception 'Personagem invÃ¡lido para esta ediÃ§Ã£o.';
    end if;
    if v_unit.unit_type <> 'group' then
      raise exception 'Personagens vinculados devem ser escalados dentro de um grupo.';
    end if;
  end if;

  if new.group_id is not null then
    select * into v_group from public.event_service_units where id = new.group_id;
    if not found or v_group.edition_id <> v_unit.edition_id or v_group.unit_type <> 'group' then
      raise exception 'Grupo invÃ¡lido para esta ediÃ§Ã£o.';
    end if;
  end if;

  if v_unit.unit_type = 'character' then
    v_character := v_unit;
  end if;
  if v_character.id is not null and v_character.per_group is true then
    if new.group_id is null then
      raise exception 'Escolha o grupo para este personagem.';
    end if;
    if v_character.max_people is not null then
      select count(*) into v_character_count
      from public.event_service_assignments assignment
      where assignment.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        and assignment.group_id = new.group_id
        and (
          assignment.unit_id = v_character.id
          or assignment.linked_character_id = v_character.id
        );
      if v_character_count >= v_character.max_people then
        raise exception 'O limite de % pessoa(s) para % neste grupo jÃ¡ foi atingido.',
          v_character.max_people, v_character.name;
      end if;
    end if;
  end if;

  if new.user_id is not null then
    select coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email)
      into new.person_name
    from public.profiles profile
    where profile.id = new.user_id
      and coalesce(profile.is_deleted, false) is false;
    if new.person_name is null then raise exception 'UsuÃ¡rio nÃ£o encontrado ou inativo.'; end if;
    new.external_name := '';
  else
    new.external_name := left(trim(new.external_name), 160);
    new.person_name := new.external_name;
  end if;

  new.role_title := left(trim(coalesce(new.role_title, '')), 160);
  new.notes := left(trim(coalesce(new.notes, '')), 1000);
  if v_unit.unit_type <> 'sector' then
    new.is_primary := false;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_prepare_event_service_assignment_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_prepare_event_service_slot_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_unit public.event_service_units%rowtype;
  v_location public.event_service_units%rowtype;
begin
  select * into v_unit from public.event_service_units where id = new.unit_id;
  if not found then raise exception 'Grupo, oficina ou escala nÃ£o encontrada.'; end if;
  new.edition_id := v_unit.edition_id;
  if new.location_id is not null then
    select * into v_location from public.event_service_units where id = new.location_id;
    if not found or v_location.edition_id <> v_unit.edition_id or v_location.unit_type <> 'location' then
      raise exception 'Local invÃ¡lido para esta ediÃ§Ã£o.';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_prepare_event_service_slot_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_prepare_material_item_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_unit public.event_service_units%rowtype;
  v_quantity_change_allowed boolean := coalesce(current_setting('forjados.material_movement', true), '') = '1';
begin
  select * into v_unit
  from public.event_service_units
  where id = new.sector_unit_id;

  if not found or v_unit.unit_type <> 'sector' or v_unit.edition_id <> new.edition_id then
    raise exception 'Escolha um setor vÃ¡lido da ediÃ§Ã£o selecionada.';
  end if;

  if tg_op = 'UPDATE' then
    if new.quantity is distinct from old.quantity and not v_quantity_change_allowed then
      raise exception 'Altere a quantidade por meio de uma movimentaÃ§Ã£o.';
    end if;

    if new.is_archived is distinct from old.is_archived
       and not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
      raise exception 'Somente Admin ou Diretoria podem arquivar ou restaurar materiais.';
    end if;

    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  new.name := left(trim(new.name), 160);
  new.category := left(trim(coalesce(new.category, '')), 120);
  new.unit := left(trim(new.unit), 40);
  new.location := left(trim(coalesce(new.location, '')), 180);
  new.responsible_name := left(trim(coalesce(new.responsible_name, '')), 160);
  new.notes := left(trim(coalesce(new.notes, '')), 2000);
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_prepare_material_item_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_prepare_trail_group_traffic_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text := 'Sistema';
  v_station_id uuid;
begin
  if not exists (
    select 1
    from public.event_service_units unit
    where unit.id = new.group_id
      and unit.edition_id = new.edition_id
      and unit.unit_type = 'group'
      and unit.is_active is true
  ) then
    raise exception 'Grupo invalido para esta edicao.' using errcode = '22023';
  end if;

  foreach v_station_id in array array[
    new.station_id,
    new.origin_station_id,
    new.destination_station_id
  ] loop
    if v_station_id is not null and not exists (
      select 1
      from public.trail_map_stations station
      where station.id = v_station_id
        and station.edition_id = new.edition_id
        and station.is_active is true
    ) then
      raise exception 'Estacao invalida para esta edicao.' using errcode = '22023';
    end if;
  end loop;

  if v_actor_id is not null then
    select coalesce(
      nullif(profile.display_name, ''),
      nullif(profile.full_name, ''),
      profile.email,
      'Operador'
    )
    into v_actor_name
    from public.profiles profile
    where profile.id = v_actor_id;
  end if;

  new.updated_by := v_actor_id;
  new.updated_by_name := coalesce(v_actor_name, 'Operador');
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_prepare_trail_group_traffic_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_record_trail_group_traffic_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.trail_group_traffic_history (
    traffic_id, edition_id, group_id, station_id, origin_station_id,
    destination_station_id, marker_x, marker_y, movement_status,
    traffic_signal, delay_minutes, notes, changed_by, changed_by_name, changed_at
  ) values (
    new.id, new.edition_id, new.group_id, new.station_id, new.origin_station_id,
    new.destination_station_id, new.marker_x, new.marker_y, new.movement_status,
    new.traffic_signal, new.delay_minutes, new.notes, new.updated_by,
    new.updated_by_name, new.updated_at
  );
  return null;
end;
$$;


ALTER FUNCTION "private"."forjados_record_trail_group_traffic_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_refresh_profile_sectors_v1"("p_user_id" "uuid", "p_edition_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_sectors text[];
  v_primary text;
begin
  if p_user_id is null then return; end if;
  if not exists (
    select 1 from public.forjados_editions edition
    where edition.id = p_edition_id and edition.is_active is true
  ) then return; end if;

  select coalesce(array_agg(unit.name order by assignment.is_primary desc, unit.display_order, unit.name), '{}'::text[]),
         (array_agg(unit.name order by assignment.is_primary desc, unit.display_order, unit.name))[1]
    into v_sectors, v_primary
  from public.event_service_assignments assignment
  join public.event_service_units unit on unit.id = assignment.unit_id
  where assignment.edition_id = p_edition_id
    and assignment.user_id = p_user_id
    and unit.unit_type = 'sector'
    and unit.is_active is true;

  update public.profiles profile
  set sectors = coalesce(v_sectors, '{}'::text[]),
      primary_team = v_primary,
      updated_at = now()
  where profile.id = p_user_id;
end;
$$;


ALTER FUNCTION "private"."forjados_refresh_profile_sectors_v1"("p_user_id" "uuid", "p_edition_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."material_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "sector_unit_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity" numeric(12,2) NOT NULL,
    "quantity_delta" numeric(12,2) NOT NULL,
    "previous_quantity" numeric(12,2) NOT NULL,
    "resulting_quantity" numeric(12,2) NOT NULL,
    "borrower" "text" DEFAULT ''::"text" NOT NULL,
    "due_date" "date",
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_by_name" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_movements_balances_check" CHECK ((("previous_quantity" >= (0)::numeric) AND ("resulting_quantity" >= (0)::numeric))),
    CONSTRAINT "material_movements_borrower_check" CHECK (("char_length"("borrower") <= 180)),
    CONSTRAINT "material_movements_notes_check" CHECK (("char_length"("notes") <= 2000)),
    CONSTRAINT "material_movements_quantity_check" CHECK ((("quantity" > (0)::numeric) AND ("quantity_delta" <> (0)::numeric))),
    CONSTRAINT "material_movements_type_check" CHECK (("movement_type" = ANY (ARRAY['entry'::"text", 'exit'::"text", 'loan'::"text", 'return'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."material_movements" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_register_material_movement_v1"("p_item_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_borrower" "text" DEFAULT ''::"text", "p_due_date" "date" DEFAULT NULL::"date", "p_notes" "text" DEFAULT ''::"text") RETURNS "public"."material_movements"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_item public.material_items%rowtype;
  v_delta numeric(12, 2);
  v_result numeric(12, 2);
  v_movement public.material_movements%rowtype;
  v_actor_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;

  select * into v_item
  from public.material_items
  where id = p_item_id
  for update;

  if not found then raise exception 'Material nÃ£o encontrado.'; end if;
  if v_item.is_archived then raise exception 'Materiais arquivados nÃ£o podem ser movimentados.'; end if;
  if not private.forjados_can_manage_material_sector_v1(v_item.edition_id, v_item.sector_unit_id) then
    raise exception 'VocÃª nÃ£o pode movimentar materiais deste setor.';
  end if;
  if p_movement_type not in ('entry', 'exit', 'loan', 'return', 'adjustment') then
    raise exception 'Tipo de movimentaÃ§Ã£o invÃ¡lido.';
  end if;

  if p_movement_type = 'adjustment' then
    if p_quantity is null or p_quantity < 0 then
      raise exception 'Informe o novo saldo, igual ou maior que zero.';
    end if;
    v_result := round(p_quantity, 2);
    v_delta := v_result - v_item.quantity;
  else
    if p_quantity is null or p_quantity <= 0 then
      raise exception 'A quantidade deve ser maior que zero.';
    end if;
    v_delta := case
      when p_movement_type in ('entry', 'return') then round(p_quantity, 2)
      else -round(p_quantity, 2)
    end;
    v_result := v_item.quantity + v_delta;
  end if;

  if v_delta = 0 then raise exception 'A movimentaÃ§Ã£o nÃ£o altera o saldo atual.'; end if;
  if v_result < 0 then raise exception 'A movimentaÃ§Ã£o deixaria o estoque negativo.'; end if;
  if p_movement_type = 'loan' and char_length(trim(coalesce(p_borrower, ''))) < 2 then
    raise exception 'Informe quem receberÃ¡ o emprÃ©stimo.';
  end if;

  select coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email, 'UsuÃ¡rio')
    into v_actor_name
  from public.profiles profile
  where profile.id = (select auth.uid());

  insert into public.material_movements (
    item_id, edition_id, sector_unit_id, movement_type, quantity, quantity_delta,
    previous_quantity, resulting_quantity, borrower, due_date, notes, created_by, created_by_name
  ) values (
    v_item.id, v_item.edition_id, v_item.sector_unit_id, p_movement_type,
    abs(v_delta), v_delta, v_item.quantity, v_result,
    left(trim(coalesce(p_borrower, '')), 180), p_due_date,
    left(trim(coalesce(p_notes, '')), 2000), (select auth.uid()), coalesce(v_actor_name, 'Sistema')
  ) returning * into v_movement;

  perform set_config('forjados.material_movement', '1', true);
  update public.material_items
  set quantity = v_result,
      status = case
        when p_movement_type = 'loan' then 'loaned'
        when p_movement_type = 'return' and status = 'loaned' then 'available'
        else status
      end,
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = v_item.id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    (select auth.uid()),
    'material.movement.' || p_movement_type,
    'material_movements',
    v_movement.id::text,
    format('MovimentaÃ§Ã£o de material: %s.', p_movement_type),
    to_jsonb(v_movement)
  );

  return v_movement;
end;
$$;


ALTER FUNCTION "private"."forjados_register_material_movement_v1"("p_item_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_borrower" "text", "p_due_date" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_run_automation_tick_v1"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_message_result jsonb;
  v_has_push_work boolean := false;
  v_request_id bigint := null;
begin
  select public.forjados_process_due_automated_messages()
  into v_message_result;

  select exists (
    select 1
    from public.push_notification_queue queue_item
    where queue_item.attempts < 5
      and (
        queue_item.status = 'queued'
        or (
          queue_item.status = 'processing'
          and queue_item.updated_at < now() - interval '5 minutes'
        )
      )
  ) into v_has_push_work;

  if v_has_push_work then
    select net.http_post(
      url := 'https://szmujymzcifxnlladktn.supabase.co/functions/v1/send-push-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-forjados-cron-secret', (
          select secret.secret_value
          from public.internal_runtime_secrets secret
          where secret.secret_name = 'push_cron'
          limit 1
        )
      ),
      body := jsonb_build_object('source', 'pg_cron'),
      timeout_milliseconds := 25000
    ) into v_request_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'messages', coalesce(v_message_result, '{}'::jsonb),
    'push_requested', v_request_id is not null,
    'request_id', v_request_id,
    'processed_at', now()
  );
end;
$$;


ALTER FUNCTION "private"."forjados_run_automation_tick_v1"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_scale_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "shift_minutes" integer DEFAULT 90 NOT NULL,
    "men_per_shift" integer DEFAULT 2 NOT NULL,
    "women_per_shift" integer DEFAULT 2 NOT NULL,
    "min_rest_minutes" integer DEFAULT 180 NOT NULL,
    "avoid_consecutive" boolean DEFAULT true NOT NULL,
    "status" "text" DEFAULT 'published'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "delete_reason" "text",
    "edition_id" "uuid",
    "service_unit_id" "uuid",
    "scale_type" "text" DEFAULT 'accommodation'::"text" NOT NULL,
    CONSTRAINT "service_scale_schedules_scale_type_check" CHECK (("scale_type" = ANY (ARRAY['accommodation'::"text", 'main_gate'::"text"]))),
    CONSTRAINT "service_scale_schedules_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."service_scale_schedules" OWNER TO "postgres";


COMMENT ON COLUMN "public"."service_scale_schedules"."service_unit_id" IS 'Escala operacional correspondente exibida na aba ServiÃ§os.';



COMMENT ON COLUMN "public"."service_scale_schedules"."scale_type" IS 'Destino da escala: accommodation (Alojamento) ou main_gate (PortÃ£o Principal).';



CREATE OR REPLACE FUNCTION "private"."forjados_save_service_scale_v3"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") RETURNS "public"."service_scale_schedules"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    raise exception 'ConfiguraÃ§Ã£o da escala invÃ¡lida.' using errcode = '22023';
  end if;

  v_scale_type := coalesce(nullif(p_config ->> 'scale_type', ''), 'accommodation');
  v_requested_status := coalesce(nullif(p_config ->> 'status', ''), 'published');
  if v_scale_type not in ('accommodation', 'main_gate') then
    raise exception 'Escolha Alojamento ou PortÃ£o Principal.' using errcode = '22023';
  end if;
  if v_requested_status not in ('draft', 'published') then
    raise exception 'Status da escala invÃ¡lido.' using errcode = '22023';
  end if;

  select edition.id
  into v_edition_id
  from public.forjados_editions edition
  where edition.is_active is true
  order by edition.starts_at asc
  limit 1;

  if v_edition_id is null then
    raise exception 'NÃ£o hÃ¡ uma ediÃ§Ã£o ativa para receber esta escala.' using errcode = '22023';
  end if;

  v_scale_name := case v_scale_type
    when 'main_gate' then 'Escala PortÃ£o Principal'
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
    raise exception 'A escala operacional % nÃ£o estÃ¡ configurada nesta ediÃ§Ã£o.', v_scale_name using errcode = '22023';
  end if;

  -- Salva primeiro como rascunho usando toda a validaÃ§Ã£o consolidada da v2.
  -- Assim a v2 nÃ£o dispara a notificaÃ§Ã£o fixa de alojamento; a mensagem correta
  -- Ã© criada abaixo depois que o tipo escolhido estiver vinculado.
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
          || 'â€“'
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
        left('VocÃª estÃ¡ na ' || v_scale_name, 160),
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
    'Escala de serviÃ§o vinculada automaticamente Ã  aba ServiÃ§os.',
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


ALTER FUNCTION "private"."forjados_save_service_scale_v3"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_seed_event_services_on_edition_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.forjados_seed_event_services_v1(new.id);
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_seed_event_services_on_edition_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_seed_event_services_v1"("p_edition_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.event_service_units (
    edition_id, unit_type, name, description, min_people, max_people, per_group, display_order
  ) values
    (p_edition_id, 'character', 'Guias', 'Guias que acompanham cada grupo.', 2, 2, true, 10),
    (p_edition_id, 'character', 'Inimigo', 'Personagem do inimigo em cada grupo.', 1, 1, true, 20),
    (p_edition_id, 'character', 'Infiltrado', 'Um ou dois infiltrados por grupo.', 1, 2, true, 30),
    (p_edition_id, 'character', 'EspÃ­rito Santo', 'RepresentaÃ§Ã£o do EspÃ­rito Santo em cada grupo.', 1, 1, true, 40),
    (p_edition_id, 'character', 'InvisÃ­vel', 'Dois invisÃ­veis por grupo.', 2, 2, true, 50),
    (p_edition_id, 'character', 'Procurados', 'Procurado responsÃ¡vel por cada grupo.', 1, 1, true, 60),
    (p_edition_id, 'character', 'Enfermeiro', 'ReferÃªncia de cuidado e saÃºde do grupo.', 1, 1, true, 70),
    (p_edition_id, 'character', 'MÃ­dia', 'ResponsÃ¡vel de mÃ­dia do grupo.', 1, 1, true, 80)
  on conflict do nothing;

  insert into public.event_service_units (edition_id, unit_type, name, display_order)
  select p_edition_id, 'sector', seed.name, seed.ord
  from (values
    ('LideranÃ§a', 10), ('ConfecÃ§Ã£o', 20), ('LogÃ­stica', 30), ('SeguranÃ§a', 40),
    ('Limpeza', 50), ('Cozinha', 60), ('IntercessÃ£o', 70), ('CrianÃ§as', 80),
    ('Rancho', 90), ('MÃ­dia', 100), ('Tesouraria', 110), ('Louvor', 120),
    ('SaÃºde', 130), ('RecepÃ§Ã£o', 140), ('Transporte', 150),
    ('ComunicaÃ§Ã£o', 160), ('Apoio', 170), ('Outro', 999)
  ) seed(name, ord)
  on conflict do nothing;

  insert into public.event_service_units (edition_id, unit_type, name, display_order)
  select p_edition_id, 'location', seed.name, seed.ord
  from (values
    ('RecepÃ§Ã£o / Arrebatamento', 10), ('ContÃªiner', 20), ('Sepultamento', 30),
    ('Selva', 40), ('DepressÃ£o', 50), ('Testemunho', 60), ('FamÃ­lia', 70),
    ('Falsa Baiana', 80), ('Tenda MissÃµes / Mendigo', 90), ('Internauta', 100),
    ('Igreja Morna', 110), ('FamÃ­lia Restaurada', 120), ('CracolÃ¢ndia', 130),
    ('Igreja Adormecida', 140), ('Campo', 150), ('Ponte', 160), ('Lama', 170)
  ) seed(name, ord)
  on conflict do nothing;

  insert into public.event_service_units (edition_id, unit_type, name, color, display_order)
  values
    (p_edition_id, 'group', 'Vermelho', '#B91C1C', 10),
    (p_edition_id, 'group', 'Bronze', '#A16207', 20),
    (p_edition_id, 'group', 'Prata', '#64748B', 30),
    (p_edition_id, 'group', 'Ouro', '#D4A017', 40)
  on conflict do nothing;

  insert into public.event_service_units (edition_id, unit_type, name, display_order)
  values
    (p_edition_id, 'scale', 'Escala Alojamento', 10),
    (p_edition_id, 'scale', 'Escala PortÃ£o Principal', 20)
  on conflict do nothing;

  insert into public.event_service_assignments (
    edition_id, unit_id, user_id, assignment_kind, is_leader, is_primary, role_title
  )
  select p_edition_id,
         unit.id,
         profile.id,
         'staff',
         profile.role::text in ('leader', 'director', 'admin') or coalesce(profile.is_admin, false),
         unit.name = profile.primary_team,
         case when profile.role::text = 'leader' then 'LÃ­der do setor' else '' end
  from public.profiles profile
  join public.event_service_units unit
    on unit.edition_id = p_edition_id
   and unit.unit_type = 'sector'
   and (unit.name = profile.primary_team or unit.name = any(coalesce(profile.sectors, '{}'::text[])))
  where profile.inscription_status::text = 'approved'
    and coalesce(profile.is_deleted, false) is false
  on conflict do nothing;
end;
$$;


ALTER FUNCTION "private"."forjados_seed_event_services_v1"("p_edition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_seed_trail_route_plan_on_group_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.unit_type = 'group' and new.is_active is true then
    perform private.forjados_seed_trail_route_plans_v1(new.edition_id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_seed_trail_route_plan_on_group_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_seed_trail_route_plans_v1"("p_edition_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_start timestamptz;
begin
  insert into public.trail_map_stations (
    edition_id, station_key, label, short_label, station_kind,
    x_percent, y_percent, display_order, is_active
  ) values (
    p_edition_id, 'wanted', 'Procurado', 'Procurado', 'station',
    59.00, 50.00, 185, true
  )
  on conflict (edition_id, station_key) do update
    set label = excluded.label, short_label = excluded.short_label, is_active = true;

  insert into public.trail_map_connections (
    edition_id, from_station_id, to_station_id, connection_kind, is_bidirectional, display_order
  )
  select p_edition_id, source.id, target.id, edge.kind, true, edge.display_order
  from (values
    ('field', 'wanted', 'connector', 240),
    ('wanted', 'burial', 'connector', 250),
    ('wanted', 'false_baiana', 'connector', 260)
  ) edge(from_key, to_key, kind, display_order)
  join public.trail_map_stations source
    on source.edition_id = p_edition_id and source.station_key = edge.from_key
  join public.trail_map_stations target
    on target.edition_id = p_edition_id and target.station_key = edge.to_key
  on conflict (edition_id, from_station_id, to_station_id) do nothing;

  select (
    ((coalesce(edition.starts_at, now()) at time zone 'America/Sao_Paulo')::date + 1 + time '09:00')
    at time zone 'America/Sao_Paulo'
  ) into v_start
  from public.forjados_editions edition
  where edition.id = p_edition_id;

  insert into public.trail_route_plans (edition_id, group_id, starts_at)
  select p_edition_id, group_unit.id, v_start
  from public.event_service_units group_unit
  where group_unit.edition_id = p_edition_id
    and group_unit.unit_type = 'group'
    and group_unit.is_active is true
  on conflict (edition_id, group_id) do nothing;

  insert into public.trail_route_plan_steps (
    plan_id, edition_id, group_id, station_id, label,
    ideal_order, stay_minutes, travel_minutes, is_break
  )
  select
    plan.id, p_edition_id, group_unit.id, station.id, seed.label,
    seed.step_order, seed.stay_minutes, 0, seed.is_break
  from (values
    ('vermelho', 1, 'field', 'Campo', 5, false),
    ('vermelho', 2, 'wanted', 'Procurado', 10, false),
    ('vermelho', 3, 'burial', 'Sepultamento', 30, false),
    ('vermelho', 4, 'forest', 'Selva', 30, false),
    ('vermelho', 5, 'depression', 'DepressÃ£o', 30, false),
    ('vermelho', 6, 'testimony', 'Testemunho', 30, false),
    ('vermelho', 7, 'destroyed_family', 'FamÃ­lia DestruÃ­da', 40, false),
    ('vermelho', 8, 'false_baiana', 'AlmoÃ§o Â· Falsa Baiana', 40, true),
    ('vermelho', 9, 'false_baiana', 'Falsa Baiana', 30, false),
    ('vermelho', 10, 'beggar', 'Mendigo', 10, false),
    ('vermelho', 11, 'internet_user', 'Internauta', 20, false),
    ('vermelho', 12, 'lukewarm_church', 'Igreja Morna', 25, false),
    ('vermelho', 13, 'restored_family', 'FamÃ­lia Restaurada', 30, false),
    ('vermelho', 14, 'bridge', 'Ponte', 15, false),
    ('vermelho', 15, 'drug_scene', 'CracolÃ¢ndia', 35, false),
    ('vermelho', 16, 'container', 'ContÃªiner', 30, false),
    ('vermelho', 17, 'sleeping_church', 'Igreja Adormecida', 30, false),
    ('vermelho', 18, 'mud', 'Lama', 20, false),
    ('vermelho', 19, 'enemy_reveal', 'RevelaÃ§Ã£o do Inimigo', 20, false),

    ('bronze', 1, 'field', 'Campo', 10, false),
    ('bronze', 2, 'container', 'ContÃªiner', 15, false),
    ('bronze', 3, 'false_baiana', 'Falsa Baiana', 35, false),
    ('bronze', 4, 'destroyed_family', 'FamÃ­lia DestruÃ­da', 40, false),
    ('bronze', 5, 'beggar', 'Mendigo', 10, false),
    ('bronze', 6, 'internet_user', 'Internauta', 20, false),
    ('bronze', 7, 'wanted', 'Procurado', 30, false),
    ('bronze', 8, 'burial', 'Sepultamento', 30, false),
    ('bronze', 9, 'burial', 'AlmoÃ§o Â· Sepultamento', 40, true),
    ('bronze', 10, 'forest', 'Selva', 30, false),
    ('bronze', 11, 'depression', 'DepressÃ£o', 30, false),
    ('bronze', 12, 'testimony', 'Testemunho', 40, false),
    ('bronze', 13, 'lukewarm_church', 'Igreja Morna', 30, false),
    ('bronze', 14, 'restored_family', 'FamÃ­lia Restaurada', 35, false),
    ('bronze', 15, 'bridge', 'Ponte', 25, false),
    ('bronze', 16, 'drug_scene', 'CracolÃ¢ndia', 35, false),
    ('bronze', 17, 'sleeping_church', 'Igreja Adormecida', 25, false),
    ('bronze', 18, 'mud', 'Lama', 20, false),
    ('bronze', 19, 'enemy_reveal', 'RevelaÃ§Ã£o do Inimigo', 20, false),

    ('prata', 1, 'field', 'Campo', 5, false),
    ('prata', 2, 'false_baiana', 'Falsa Baiana', 25, false),
    ('prata', 3, 'container', 'ContÃªiner', 10, false),
    ('prata', 4, 'wanted', 'Procurado', 10, false),
    ('prata', 5, 'burial', 'Sepultamento', 25, false),
    ('prata', 6, 'forest', 'Selva', 30, false),
    ('prata', 7, 'depression', 'DepressÃ£o', 30, false),
    ('prata', 8, 'testimony', 'Testemunho', 30, false),
    ('prata', 9, 'testimony', 'AlmoÃ§o Â· Testemunho', 40, true),
    ('prata', 10, 'destroyed_family', 'FamÃ­lia DestruÃ­da', 40, false),
    ('prata', 11, 'sleeping_church', 'Igreja Adormecida', 20, false),
    ('prata', 12, 'beggar', 'Mendigo', 15, false),
    ('prata', 13, 'internet_user', 'Internauta', 20, false),
    ('prata', 14, 'lukewarm_church', 'Igreja Morna', 30, false),
    ('prata', 15, 'restored_family', 'FamÃ­lia Restaurada', 30, false),
    ('prata', 16, 'bridge', 'Ponte', 20, false),
    ('prata', 17, 'drug_scene', 'CracolÃ¢ndia', 40, false),
    ('prata', 18, 'mud', 'Lama', 20, false),
    ('prata', 19, 'enemy_reveal', 'RevelaÃ§Ã£o do Inimigo', 20, false),

    ('ouro', 1, 'field', 'Campo', 5, false),
    ('ouro', 2, 'destroyed_family', 'FamÃ­lia DestruÃ­da', 30, false),
    ('ouro', 3, 'beggar', 'Mendigo', 10, false),
    ('ouro', 4, 'internet_user', 'Internauta', 20, false),
    ('ouro', 5, 'false_baiana', 'Falsa Baiana', 35, false),
    ('ouro', 6, 'wanted', 'Procurado', 10, false),
    ('ouro', 7, 'burial', 'Sepultamento', 30, false),
    ('ouro', 8, 'forest', 'Selva', 30, false),
    ('ouro', 9, 'forest', 'AlmoÃ§o Â· Selva', 40, true),
    ('ouro', 10, 'depression', 'DepressÃ£o', 40, false),
    ('ouro', 11, 'testimony', 'Testemunho', 30, false),
    ('ouro', 12, 'sleeping_church', 'Igreja Adormecida', 20, false),
    ('ouro', 13, 'container', 'ContÃªiner', 15, false),
    ('ouro', 14, 'drug_scene', 'CracolÃ¢ndia', 45, false),
    ('ouro', 15, 'lukewarm_church', 'Igreja Morna', 35, false),
    ('ouro', 16, 'restored_family', 'FamÃ­lia Restaurada', 40, false),
    ('ouro', 17, 'bridge', 'Ponte', 25, false),
    ('ouro', 18, 'mud', 'Lama', 20, false),
    ('ouro', 19, 'enemy_reveal', 'RevelaÃ§Ã£o do Inimigo', 20, false)
  ) seed(group_name, step_order, station_key, label, stay_minutes, is_break)
  join public.event_service_units group_unit
    on group_unit.edition_id = p_edition_id
   and group_unit.unit_type = 'group'
   and lower(group_unit.name) = seed.group_name
  join public.trail_route_plans plan
    on plan.edition_id = p_edition_id and plan.group_id = group_unit.id
  left join public.trail_map_stations station
    on station.edition_id = p_edition_id and station.station_key = seed.station_key
  where not exists (
    select 1 from public.trail_route_plan_steps existing
    where existing.plan_id = plan.id
  );
end;
$$;


ALTER FUNCTION "private"."forjados_seed_trail_route_plans_v1"("p_edition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_seed_trail_traffic_on_edition_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.forjados_seed_trail_traffic_v1(new.id);
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_seed_trail_traffic_on_edition_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_seed_trail_traffic_on_group_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.unit_type = 'group' and new.is_active is true then
    perform private.forjados_seed_trail_traffic_v1(new.edition_id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_seed_trail_traffic_on_group_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_seed_trail_traffic_v1"("p_edition_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_gate_id uuid;
begin
  insert into public.trail_map_stations (
    edition_id, service_unit_id, station_key, label, short_label,
    station_kind, x_percent, y_percent, display_order
  )
  select
    p_edition_id,
    unit.id,
    seed.station_key,
    seed.label,
    seed.short_label,
    seed.station_kind,
    seed.x_percent,
    seed.y_percent,
    seed.display_order
  from (values
    ('main_gate', 'PortÃ£o Principal', 'PortÃ£o', 'gate', 5.50::numeric, 40.00::numeric, 10, null::text),
    ('burial', 'Sepultamento', 'Sepultamento', 'station', 9.00, 15.00, 20, 'Sepultamento'),
    ('forest', 'Selva', 'Selva', 'station', 26.00, 8.00, 30, 'Selva'),
    ('depression', 'DepressÃ£o', 'DepressÃ£o', 'station', 40.00, 14.00, 40, 'DepressÃ£o'),
    ('testimony', 'Testemunho', 'Testemunho', 'station', 54.00, 8.00, 50, 'Testemunho'),
    ('destroyed_family', 'FamÃ­lia DestruÃ­da', 'FamÃ­lia', 'station', 72.00, 18.00, 60, 'FamÃ­lia'),
    ('false_baiana', 'Falsa Baiana', 'Falsa Baiana', 'station', 78.00, 33.00, 70, 'Falsa Baiana'),
    ('beggar', 'Tenda MissÃµes / Mendigo', 'Mendigo', 'station', 91.00, 46.00, 80, 'Tenda MissÃµes / Mendigo'),
    ('internet_user', 'Internauta', 'Internauta', 'station', 89.00, 73.00, 90, 'Internauta'),
    ('lukewarm_church', 'Igreja Morna', 'Igreja Morna', 'station', 72.00, 88.00, 100, 'Igreja Morna'),
    ('reception', 'RecepÃ§Ã£o / Arrebatamento', 'Arrebatamento', 'station', 51.00, 89.00, 110, 'RecepÃ§Ã£o / Arrebatamento'),
    ('restored_family', 'FamÃ­lia Restaurada', 'FamÃ­lia Restaurada', 'station', 31.00, 85.00, 120, 'FamÃ­lia Restaurada'),
    ('bridge', 'Ponte', 'Ponte', 'station', 16.00, 71.00, 130, 'Ponte'),
    ('drug_scene', 'CracolÃ¢ndia', 'CracolÃ¢ndia', 'station', 32.00, 61.00, 140, 'CracolÃ¢ndia'),
    ('mud', 'Lama', 'Lama', 'station', 50.00, 67.00, 150, 'Lama'),
    ('sleeping_church', 'Igreja Adormecida', 'Igreja Adormecida', 'station', 70.00, 64.00, 160, 'Igreja Adormecida'),
    ('container', 'ContÃªiner', 'ContÃªiner', 'station', 33.00, 38.00, 170, 'ContÃªiner'),
    ('field', 'Campo', 'Campo', 'field', 53.00, 34.00, 180, 'Campo'),
    ('enemy_reveal', 'RevelaÃ§Ã£o do Inimigo', 'RevelaÃ§Ã£o', 'reveal', 65.00, 40.00, 190, null),
    ('temple_qg', 'Templo / QG', 'QG', 'qg', 25.00, 49.00, 200, null),
    ('command_hold', 'Area de Espera', 'Espera', 'hold', 49.00, 51.00, 210, null)
  ) seed(
    station_key, label, short_label, station_kind,
    x_percent, y_percent, display_order, service_unit_name
  )
  left join public.event_service_units unit
    on unit.edition_id = p_edition_id
   and unit.unit_type = 'location'
   and lower(unit.name) = lower(seed.service_unit_name)
  on conflict (edition_id, station_key) do update
    set service_unit_id = coalesce(excluded.service_unit_id, trail_map_stations.service_unit_id),
        label = excluded.label,
        short_label = excluded.short_label,
        station_kind = excluded.station_kind,
        display_order = excluded.display_order,
        is_active = true;

  insert into public.trail_map_connections (
    edition_id, from_station_id, to_station_id, connection_kind,
    is_bidirectional, display_order
  )
  select p_edition_id, source.id, target.id, edge.connection_kind, true, edge.display_order
  from (values
    ('main_gate', 'burial', 'trail', 10),
    ('burial', 'forest', 'trail', 20),
    ('forest', 'depression', 'trail', 30),
    ('depression', 'testimony', 'trail', 40),
    ('testimony', 'destroyed_family', 'trail', 50),
    ('destroyed_family', 'false_baiana', 'trail', 60),
    ('false_baiana', 'beggar', 'trail', 70),
    ('beggar', 'internet_user', 'trail', 80),
    ('internet_user', 'lukewarm_church', 'trail', 90),
    ('lukewarm_church', 'reception', 'trail', 100),
    ('reception', 'restored_family', 'trail', 110),
    ('restored_family', 'bridge', 'trail', 120),
    ('bridge', 'drug_scene', 'trail', 130),
    ('drug_scene', 'mud', 'trail', 140),
    ('mud', 'sleeping_church', 'trail', 150),
    ('sleeping_church', 'beggar', 'trail', 160),
    ('main_gate', 'container', 'connector', 170),
    ('container', 'field', 'connector', 180),
    ('field', 'enemy_reveal', 'connector', 190),
    ('enemy_reveal', 'false_baiana', 'connector', 200),
    ('temple_qg', 'container', 'connector', 210),
    ('temple_qg', 'command_hold', 'hold', 220),
    ('command_hold', 'field', 'hold', 230)
  ) edge(from_key, to_key, connection_kind, display_order)
  join public.trail_map_stations source
    on source.edition_id = p_edition_id and source.station_key = edge.from_key
  join public.trail_map_stations target
    on target.edition_id = p_edition_id and target.station_key = edge.to_key
  on conflict (edition_id, from_station_id, to_station_id) do nothing;

  select station.id into v_gate_id
  from public.trail_map_stations station
  where station.edition_id = p_edition_id and station.station_key = 'main_gate';

  insert into public.trail_group_traffic (
    edition_id, group_id, station_id, marker_x, marker_y,
    movement_status, traffic_signal, notes
  )
  select
    p_edition_id,
    group_unit.id,
    v_gate_id,
    5.50 + ((row_number() over (order by group_unit.display_order, group_unit.name) - 1) * 2.20),
    40.00 + ((row_number() over (order by group_unit.display_order, group_unit.name) - 1) * 2.20),
    'not_started',
    'clear',
    ''
  from public.event_service_units group_unit
  where group_unit.edition_id = p_edition_id
    and group_unit.unit_type = 'group'
    and group_unit.is_active is true
  on conflict (edition_id, group_id) do nothing;
end;
$$;


ALTER FUNCTION "private"."forjados_seed_trail_traffic_v1"("p_edition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_set_notification_read_at_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.is_read = true and old.is_read = false then
    new.read_at := now();
  elsif new.is_read = false then
    new.read_at := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_set_notification_read_at_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_stamp_trail_route_execution_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  new.updated_by := v_actor_id;
  select coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email, 'Operador')
    into new.updated_by_name
  from public.profiles profile
  where profile.id = v_actor_id;
  new.updated_by_name := coalesce(new.updated_by_name, 'Sistema');
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_stamp_trail_route_execution_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_sync_profile_sectors_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.forjados_refresh_profile_sectors_v1(old.user_id, old.edition_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.forjados_refresh_profile_sectors_v1(new.user_id, new.edition_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_sync_profile_sectors_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_validate_trail_route_plan_step_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_plan public.trail_route_plans%rowtype;
begin
  select * into v_plan from public.trail_route_plans where id = new.plan_id;
  if not found or v_plan.edition_id <> new.edition_id or v_plan.group_id <> new.group_id then
    raise exception 'Etapa nao pertence ao planejamento informado.' using errcode = '22023';
  end if;
  if new.station_id is not null and not exists (
    select 1 from public.trail_map_stations station
    where station.id = new.station_id
      and station.edition_id = new.edition_id
      and station.is_active is true
  ) then
    raise exception 'Estacao invalida para esta edicao.' using errcode = '22023';
  end if;
  new.label := trim(new.label);
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_validate_trail_route_plan_step_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."forjados_validate_trail_route_plan_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not exists (
    select 1 from public.event_service_units unit
    where unit.id = new.group_id
      and unit.edition_id = new.edition_id
      and unit.unit_type = 'group'
      and unit.is_active is true
  ) then
    raise exception 'Grupo invalido para o planejamento desta edicao.' using errcode = '22023';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."forjados_validate_trail_route_plan_v1"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "full_name" "text" DEFAULT ''::"text",
    "photo_url" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "birth_date" "date",
    "city" "text" DEFAULT ''::"text",
    "neighborhood" "text" DEFAULT ''::"text",
    "member_since" "date",
    "role" "public"."user_role" DEFAULT 'member'::"public"."user_role" NOT NULL,
    "requested_role" "public"."user_role" DEFAULT 'member'::"public"."user_role" NOT NULL,
    "inscription_status" "public"."inscription_status" DEFAULT 'pending'::"public"."inscription_status" NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    "member_id" "text",
    "sectors" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "specific_function" "text" DEFAULT ''::"text",
    "direct_leader_id" "uuid",
    "available_days" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "available_hours" "text" DEFAULT ''::"text",
    "worked_before" boolean DEFAULT false,
    "experience_level" "text" DEFAULT ''::"text",
    "shirt_size" "text" DEFAULT ''::"text",
    "food_restrictions" "text" DEFAULT ''::"text",
    "health_problems" "text" DEFAULT ''::"text",
    "continuous_medicine" "text" DEFAULT ''::"text",
    "emergency_contact" "jsonb" DEFAULT '{}'::"jsonb",
    "has_vehicle" boolean DEFAULT false NOT NULL,
    "vehicle_info" "jsonb" DEFAULT '{}'::"jsonb",
    "skills" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "custom_skills" "text" DEFAULT ''::"text",
    "terms_accepted" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "internal_notes" "text" DEFAULT ''::"text",
    "points" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "primary_team" "text",
    "retreat_count" integer DEFAULT 0 NOT NULL,
    "retreat_count_manual" integer,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "delete_reason" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_approve_profile"("p_user_id" "uuid", "p_role" "text" DEFAULT NULL::"text") RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile public.profiles;
  v_role text;
begin
  if not public.forjados_is_admin_or_director() then
    raise exception 'Sem permissÃ£o para aprovar solicitaÃ§Ã£o.' using errcode = '42501';
  end if;

  select coalesce(p_role, nullif(requested_role::text, ''), role::text, 'member')
  into v_role
  from public.profiles
  where id = p_user_id;

  if v_role is null then
    raise exception 'Membro nÃ£o encontrado.' using errcode = 'P0002';
  end if;

  update public.profiles p
  set
    inscription_status = 'approved',
    role = v_role,
    is_admin = case when v_role = 'admin' then true else coalesce(p.is_admin, false) end,
    updated_at = now()
  where p.id = p_user_id
  returning * into v_profile;

  if to_regprocedure('public.ensure_service_scale_person(uuid)') is not null then
    begin
      perform public.ensure_service_scale_person(v_profile.id);
    exception when others then
      raise notice 'ensure_service_scale_person falhou para %, mas a aprovaÃ§Ã£o continuou: %', v_profile.id, SQLERRM;
    end;
  end if;

  return v_profile;
end;
$$;


ALTER FUNCTION "public"."admin_approve_profile"("p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_dashboard_summary"() RETURNS TABLE("pending_access_requests" bigint, "pending_payment_receipts" bigint, "pending_shirt_orders" bigint, "pending_points_redemptions" bigint, "open_rides" bigint, "active_public_panel_items" bigint, "approved_members" bigint, "total_members" bigint, "pending_members" bigint, "rejected_members" bigint, "leaders_count" bigint, "directors_count" bigint, "treasury_count" bigint, "active_shirts" bigint, "total_shirt_orders" bigint, "active_points_products" bigint, "total_points_redemptions" bigint, "pending_offers" bigint, "approved_offers" bigint, "total_offers_amount" numeric, "approved_offers_amount" numeric, "total_inscription_receipts_amount" numeric, "active_automated_messages" bigint, "published_service_schedules" bigint, "active_retreats" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.forjados_is_admin_or_director() then
    raise exception 'Sem permissÃ£o para acessar o dashboard administrativo.';
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


ALTER FUNCTION "public"."admin_get_dashboard_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_pending_access_requests"() RETURNS SETOF "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.forjados_is_admin_or_director() then
    raise exception 'Sem permissÃ£o para listar solicitaÃ§Ãµes de acesso.' using errcode = '42501';
  end if;

  return query
    select *
    from public.profiles
    where inscription_status::text = 'pending'
    order by created_at desc nulls last;
end;
$$;


ALTER FUNCTION "public"."admin_list_pending_access_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_profiles"() RETURNS SETOF "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.forjados_is_admin_or_director() then
    raise exception 'Sem permissÃ£o para listar membros.' using errcode = '42501';
  end if;

  return query
    select *
    from public.profiles
    order by created_at desc nulls last;
end;
$$;


ALTER FUNCTION "public"."admin_list_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reject_profile"("p_user_id" "uuid") RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile public.profiles;
begin
  if not public.forjados_is_admin_or_director() then
    raise exception 'Sem permissÃ£o para recusar solicitaÃ§Ã£o.' using errcode = '42501';
  end if;

  update public.profiles p
  set
    inscription_status = 'rejected',
    updated_at = now()
  where p.id = p_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Membro nÃ£o encontrado.' using errcode = 'P0002';
  end if;

  return v_profile;
end;
$$;


ALTER FUNCTION "public"."admin_reject_profile"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_profile"("p_user_id" "uuid", "p_role" "text" DEFAULT NULL::"text", "p_requested_role" "text" DEFAULT NULL::"text", "p_inscription_status" "text" DEFAULT NULL::"text", "p_sectors" "text"[] DEFAULT NULL::"text"[], "p_primary_team" "text" DEFAULT NULL::"text", "p_display_name" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_city" "text" DEFAULT NULL::"text", "p_neighborhood" "text" DEFAULT NULL::"text", "p_internal_notes" "text" DEFAULT NULL::"text") RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile public.profiles;
begin
  if not public.forjados_is_admin_or_director() then
    raise exception 'Sem permissÃ£o para atualizar membro.' using errcode = '42501';
  end if;

  update public.profiles p
  set
    role = coalesce(p_role, p.role::text),
    requested_role = coalesce(p_requested_role, p.requested_role::text),
    inscription_status = coalesce(p_inscription_status, p.inscription_status::text),
    sectors = coalesce(p_sectors, p.sectors),
    primary_team = coalesce(p_primary_team, p.primary_team),
    display_name = coalesce(p_display_name, p.display_name),
    full_name = coalesce(p_display_name, p.full_name),
    phone = coalesce(p_phone, p.phone),
    city = coalesce(p_city, p.city),
    neighborhood = coalesce(p_neighborhood, p.neighborhood),
    is_admin = case
      when coalesce(p_role, p.role::text) = 'admin' then true
      when coalesce(p_role, p.role::text) <> 'admin' then false
      else coalesce(p.is_admin, false)
    end,
    updated_at = now()
  where p.id = p_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Membro nÃ£o encontrado.' using errcode = 'P0002';
  end if;

  if v_profile.inscription_status::text = 'approved'
     and to_regprocedure('public.ensure_service_scale_person(uuid)') is not null then
    begin
      perform public.ensure_service_scale_person(v_profile.id);
    exception when others then
      raise notice 'ensure_service_scale_person falhou para %, mas a aprovaÃ§Ã£o continuou: %', v_profile.id, SQLERRM;
    end;
  end if;

  return v_profile;
end;
$$;


ALTER FUNCTION "public"."admin_update_profile"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_service_scale"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'director')
        or coalesce((to_jsonb(p)->>'is_admin')::boolean, false) = true
      )
  );
$$;


ALTER FUNCTION "public"."can_manage_service_scale"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_ride_completion"("p_ride_id" "uuid", "p_completed" boolean, "p_confirmed_passenger_count" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_ride public.rides%rowtype;
  v_confirmer public.profiles%rowtype;
  v_driver public.profiles%rowtype;
  v_points integer;
  v_count integer;
  v_mode text;
begin
  if (select auth.uid()) is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '28000';
  end if;
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin ou Diretoria podem confirmar caronas.' using errcode = '42501';
  end if;

  select * into v_confirmer from public.profiles where id = (select auth.uid());
  select * into v_ride from public.rides where id = p_ride_id and deleted_at is null for update;
  if not found then raise exception 'Carona nÃ£o encontrada.'; end if;
  if v_ride.completed_points_awarded is true then raise exception 'Essa carona jÃ¡ teve os pontos lanÃ§ados.'; end if;

  select count(*) into v_count from public.ride_passengers
  where ride_id = p_ride_id and status = 'confirmed';
  if p_confirmed_passenger_count is not null then v_count := p_confirmed_passenger_count; end if;
  if v_count < 0 or v_count > v_ride.total_seats then raise exception 'Quantidade de passageiros invÃ¡lida.'; end if;

  if p_completed is false then
    update public.rides set status = 'not_completed', confirmed_passenger_count = 0,
      completed_points_awarded = false, awarded_points = 0,
      confirmed_by = (select auth.uid()), confirmed_at = now(), updated_at = now()
    where id = p_ride_id;
    return;
  end if;

  v_mode := coalesce(v_ride.points_rule_snapshot->>'mode', 'per_passenger');
  if v_mode = 'fixed' then
    v_points := greatest(coalesce((v_ride.points_rule_snapshot->>'fixed_points')::integer, 0), 0);
  else
    v_points := v_count * greatest(coalesce((v_ride.points_rule_snapshot->>'points_per_passenger')::integer, 0), 0);
  end if;

  update public.rides set status = 'completed', confirmed_passenger_count = v_count,
    completed_points_awarded = true, awarded_points = v_points,
    confirmed_by = (select auth.uid()), confirmed_at = now(), updated_at = now()
  where id = p_ride_id;

  if v_points > 0 then
    select * into v_driver from public.profiles where id = v_ride.driver_id for update;
    update public.profiles set points = points + v_points, updated_at = now() where id = v_ride.driver_id;
    insert into public.point_transactions (
      user_id, member_id, amount, reason, granted_by, granted_by_name, source_type, source_id
    ) values (
      v_ride.driver_id, coalesce(v_driver.member_id, ''), v_points,
      case when v_mode = 'fixed'
        then 'Carona concluÃ­da â€” pontuaÃ§Ã£o fixa validada'
        else 'Carona concluÃ­da â€” ' || v_count || ' passageiro(s) confirmado(s)' end,
      (select auth.uid()), coalesce(v_confirmer.display_name, v_confirmer.email), 'ride', p_ride_id
    );
    insert into public.app_notifications (user_id, title, message, type)
    values (v_ride.driver_id, 'Pontos de carona aprovados',
      v_points || ' ponto(s) foram creditados apÃ³s a validaÃ§Ã£o da carona.', 'ride');
  end if;
end;
$$;


ALTER FUNCTION "public"."confirm_ride_completion"("p_ride_id" "uuid", "p_completed" boolean, "p_confirmed_passenger_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_audit_log"("p_action" "text", "p_entity_type" "text" DEFAULT NULL::"text", "p_entity_id" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();

  insert into public.audit_logs (
    actor_id,
    actor_name,
    actor_email,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  )
  values (
    v_actor,
    public.get_actor_name(v_actor),
    public.get_actor_email(v_actor),
    p_action,
    p_entity_type,
    p_entity_id,
    p_description,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;


ALTER FUNCTION "public"."create_audit_log"("p_action" "text", "p_entity_type" "text", "p_entity_id" "text", "p_description" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text" DEFAULT ''::"text", "p_type" "text" DEFAULT 'info'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.app_notifications (user_id, title, message, type)
  values (p_user_id, p_title, coalesce(p_message, ''), coalesce(p_type, 'info'));
end;
$$;


ALTER FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_can_manage"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (
      select p.is_admin = true or p.role::text in ('admin', 'director')
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;


ALTER FUNCTION "public"."current_user_can_manage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_can_manage_finance"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select role::text in ('admin', 'treasury') or is_admin = true
     from public.profiles
     where id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."current_user_can_manage_finance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_can_manage_points"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (
      select p.is_admin = true or p.role::text in ('admin', 'director', 'leader')
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;


ALTER FUNCTION "public"."current_user_can_manage_points"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_can_view_profile"("target_user_id" "uuid", "target_sectors" "text"[], "target_status" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    -- Sempre pode ver o prÃ³prio perfil
    target_user_id = auth.uid()

    or

    -- Admin/diretor pode ver todos
    coalesce(
      (
        select
          viewer.is_admin = true
          or viewer.role::text in ('admin', 'director')
        from public.profiles viewer
        where viewer.id = auth.uid()
        limit 1
      ),
      false
    )

    or

    -- LÃ­der pode ver membros aprovados dos mesmos setores
    coalesce(
      (
        select
          viewer.role::text in ('leader', 'director', 'admin')
          and target_status = 'approved'
          and coalesce(viewer.sectors, '{}') && coalesce(target_sectors, '{}')
        from public.profiles viewer
        where viewer.id = auth.uid()
        limit 1
      ),
      false
    );
$$;


ALTER FUNCTION "public"."current_user_can_view_profile"("target_user_id" "uuid", "target_sectors" "text"[], "target_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select is_admin = true or role::text = 'admin'
     from public.profiles
     where id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."current_user_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_my_active_edition_enrollment"() RETURNS TABLE("edition_id" "uuid", "edition_title" "text", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone, "amount" numeric, "enrollment_id" "uuid", "enrollment_status" "text", "payment_status" "text", "paid_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_edition public.forjados_editions%rowtype;
begin
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;

  select *
  into v_edition
  from public.forjados_editions
  where is_active = true
  order by starts_at asc
  limit 1;

  if v_edition.id is null then
    return;
  end if;

  if v_edition.status = 'open' then
    insert into public.edition_enrollments (edition_id, user_id, amount)
    values (v_edition.id, v_user_id, v_edition.registration_amount)
    on conflict (edition_id, user_id) do nothing;
  end if;

  return query
  select *
  from public.get_my_active_edition_enrollment();
end;
$$;


ALTER FUNCTION "public"."ensure_my_active_edition_enrollment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_service_scale_person"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  p public.profiles;
begin
  select * into p
  from public.profiles
  where id = p_user_id;

  if p.id is null then
    return;
  end if;

  if p.inscription_status <> 'approved' then
    return;
  end if;

  insert into public.service_scale_people (
    user_id,
    display_name,
    email,
    role,
    sectors,
    is_active
  )
  values (
    p.id,
    coalesce(p.display_name, p.full_name, p.email, 'Membro'),
    coalesce(p.email, ''),
    coalesce(p.role::text, 'member'),
    coalesce(p.sectors, '{}'),
    true
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    email = excluded.email,
    role = excluded.role,
    sectors = excluded.sectors,
    is_active = true,
    updated_at = now();
end;
$$;


ALTER FUNCTION "public"."ensure_service_scale_person"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_approve_profile_v3"("p_user_id" "uuid", "p_role" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_role text;
begin
  if not public.forjados_current_user_can_manage_v3() then
    raise exception 'Sem permissÃ£o para aprovar membro.';
  end if;

  if p_user_id is null then
    raise exception 'ID do usuÃ¡rio nÃ£o informado.';
  end if;

  select coalesce(p_role, nullif(requested_role, ''), role, 'member')
  into v_role
  from public.profiles
  where id = p_user_id;

  if v_role is null then
    raise exception 'Membro nÃ£o encontrado.';
  end if;

  if v_role not in ('member', 'leader', 'director', 'treasury', 'admin') then
    v_role := 'member';
  end if;

  update public.profiles
  set
    role = v_role,
    requested_role = coalesce(requested_role, v_role),
    inscription_status = 'approved',
    is_admin = (v_role = 'admin'),
    member_id = coalesce(
      member_id,
      case
        when v_role = 'admin' then 'ADM-' || upper(substr(replace(id::text, '-', ''), 1, 6))
        else 'EQP-' || upper(substr(replace(id::text, '-', ''), 1, 6))
      end
    ),
    sectors = coalesce(sectors, '{}'),
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Membro nÃ£o encontrado.';
  end if;

  if to_regprocedure('public.ensure_service_scale_person(uuid)') is not null then
    execute 'select public.ensure_service_scale_person($1)' using p_user_id;
  end if;
end;
$_$;


ALTER FUNCTION "public"."forjados_admin_approve_profile_v3"("p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_approve_profile_v4"("p_user_id" "uuid", "p_role" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_profile public.profiles%rowtype;
begin
  if not public.forjados_admin_is_authorized_v4() then
    raise exception 'Sem permissÃ£o para aprovar membros.' using errcode = '42501';
  end if;

  select coalesce(nullif(p_role, ''), nullif(requested_role, ''), role, 'member')
  into v_role
  from public.profiles
  where id = p_user_id;

  if v_role is null then
    raise exception 'Perfil nÃ£o encontrado.' using errcode = 'P0002';
  end if;

  if v_role not in ('member', 'leader', 'director', 'treasury', 'admin') then
    v_role := 'member';
  end if;

  update public.profiles
  set
    inscription_status = 'approved',
    role = v_role,
    requested_role = coalesce(requested_role, v_role),
    is_admin = case when v_role = 'admin' then true else coalesce(is_admin, false) end,
    updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  if not found then
    raise exception 'Perfil nÃ£o encontrado para aprovaÃ§Ã£o.' using errcode = 'P0002';
  end if;

  -- Se existir tabela de escala, tenta garantir a pessoa na escala sem quebrar a aprovaÃ§Ã£o.
  begin
    if to_regclass('public.service_scale_people') is not null then
      insert into public.service_scale_people (
        user_id,
        name,
        display_name,
        email,
        role,
        sectors,
        gender,
        is_active,
        created_at,
        updated_at
      )
      values (
        v_profile.id,
        coalesce(nullif(v_profile.display_name, ''), nullif(v_profile.full_name, ''), nullif(v_profile.email, ''), 'Membro'),
        coalesce(nullif(v_profile.display_name, ''), nullif(v_profile.full_name, ''), nullif(v_profile.email, ''), 'Membro'),
        coalesce(v_profile.email, ''),
        coalesce(v_profile.role, 'member'),
        coalesce(v_profile.sectors, '{}'::text[]),
        'male',
        true,
        now(),
        now()
      )
      on conflict (user_id) do update set
        name = excluded.name,
        display_name = excluded.display_name,
        email = excluded.email,
        role = excluded.role,
        sectors = excluded.sectors,
        is_active = true,
        updated_at = now();
    end if;
  exception when others then
    -- NÃ£o bloqueia aprovaÃ§Ã£o por causa da escala.
    null;
  end;

  -- NotificaÃ§Ã£o opcional.
  begin
    if to_regclass('public.app_notifications') is not null then
      insert into public.app_notifications (user_id, title, message, type, is_read, created_at)
      values (
        p_user_id,
        'Acesso aprovado',
        'Sua solicitaÃ§Ã£o de acesso ao aplicativo FORJADOS foi aprovada.',
        'access_approved',
        false,
        now()
      );
    end if;
  exception when others then
    null;
  end;

  -- Auditoria opcional.
  begin
    if to_regclass('public.audit_logs') is not null then
      insert into public.audit_logs (actor_id, action, entity_type, entity_id, description, metadata, created_at)
      values (
        auth.uid(),
        'profile_approved',
        'profile',
        p_user_id::text,
        'Membro aprovado pelo painel administrativo.',
        jsonb_build_object('role', v_role),
        now()
      );
    end if;
  exception when others then
    null;
  end;
end;
$$;


ALTER FUNCTION "public"."forjados_admin_approve_profile_v4"("p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_approve_profile_v5"("p_user_id" "uuid", "p_role" "text" DEFAULT NULL::"text") RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_profile public.profiles;
begin
  if not public.forjados_is_admin_v5() then
    raise exception 'Sem permissÃ£o para aprovar usuÃ¡rio.' using errcode = '42501';
  end if;

  update public.profiles p
  set
    inscription_status = 'approved',
    role = case
      when nullif(p_role, '') is not null then nullif(p_role, '')::public.user_role
      when p.requested_role is not null then p.requested_role
      when p.role is not null then p.role
      else 'member'::public.user_role
    end,
    is_admin = case
      when coalesce(nullif(p_role, ''), p.requested_role::text, p.role::text, 'member') = 'admin' then true
      else coalesce(p.is_admin, false)
    end,
    is_deleted = false,
    updated_at = now()
  where p.id = p_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'UsuÃ¡rio nÃ£o encontrado para aprovaÃ§Ã£o.' using errcode = 'P0002';
  end if;

  if to_regprocedure('public.ensure_service_scale_person(uuid)') is not null then
    begin
      execute 'select public.ensure_service_scale_person($1)' using p_user_id;
    exception when others then
      raise notice 'ensure_service_scale_person falhou: %', sqlerrm;
    end;
  end if;

  return v_profile;
end;
$_$;


ALTER FUNCTION "public"."forjados_admin_approve_profile_v5"("p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_delete_profile_v6"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.forjados_is_admin() then
    raise exception 'Apenas administradores podem excluir usuÃ¡rios.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'VocÃª nÃ£o pode excluir seu prÃ³prio usuÃ¡rio.';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and (is_admin = true or role = 'admin')) then
    raise exception 'Administradores nÃ£o podem ser excluÃ­dos por esta funÃ§Ã£o.';
  end if;

  update public.profiles
  set
    is_deleted = true,
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = 'ExcluÃ­do pelo painel administrativo',
    inscription_status = 'rejected',
    updated_at = now()
  where id = p_user_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, description, metadata, created_at)
  values (
    auth.uid(),
    'profile.soft_delete',
    'profiles',
    p_user_id::text,
    'UsuÃ¡rio removido da visualizaÃ§Ã£o pelo admin.',
    jsonb_build_object('user_id', p_user_id),
    now()
  ) on conflict do nothing;
end;
$$;


ALTER FUNCTION "public"."forjados_admin_delete_profile_v6"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_is_authorized_v4"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."forjados_admin_is_authorized_v4"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_list_pending_access_requests_v3"() RETURNS SETOF "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.forjados_current_user_can_manage_v3() then
    raise exception 'Sem permissÃ£o para listar solicitaÃ§Ãµes de acesso.';
  end if;

  return query
  select p.*
  from public.profiles p
  where coalesce(p.inscription_status, 'pending') = 'pending'
  order by p.created_at desc nulls last;
end;
$$;


ALTER FUNCTION "public"."forjados_admin_list_pending_access_requests_v3"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_list_pending_access_requests_v4"() RETURNS SETOF "public"."profiles"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.*
  from public.profiles p
  where public.forjados_admin_is_authorized_v4()
    and p.inscription_status = 'pending'
  order by p.created_at asc;
$$;


ALTER FUNCTION "public"."forjados_admin_list_pending_access_requests_v4"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_list_pending_access_requests_v5"() RETURNS SETOF "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.forjados_is_admin_v5() then
    raise exception 'Sem permissÃ£o para listar solicitaÃ§Ãµes.' using errcode = '42501';
  end if;

  return query
  select p.*
  from public.profiles p
  where p.inscription_status::text = 'pending'
    and coalesce(p.is_deleted, false) = false
    and p.role::text <> 'admin'
  order by p.created_at desc;
end;
$$;


ALTER FUNCTION "public"."forjados_admin_list_pending_access_requests_v5"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_list_profiles_v3"() RETURNS SETOF "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.forjados_current_user_can_manage_v3() then
    raise exception 'Sem permissÃ£o para listar membros.';
  end if;

  return query
  select p.*
  from public.profiles p
  order by p.created_at desc nulls last;
end;
$$;


ALTER FUNCTION "public"."forjados_admin_list_profiles_v3"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_list_profiles_v4"() RETURNS SETOF "public"."profiles"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.*
  from public.profiles p
  where public.forjados_admin_is_authorized_v4()
  order by p.created_at desc;
$$;


ALTER FUNCTION "public"."forjados_admin_list_profiles_v4"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_list_profiles_v5"() RETURNS SETOF "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.forjados_is_admin_v5() then
    raise exception 'Sem permissÃ£o para listar membros.' using errcode = '42501';
  end if;

  return query
  select p.*
  from public.profiles p
  where coalesce(p.is_deleted, false) = false
  order by p.created_at desc;
end;
$$;


ALTER FUNCTION "public"."forjados_admin_list_profiles_v5"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_reject_profile_v3"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.forjados_current_user_can_manage_v3() then
    raise exception 'Sem permissÃ£o para recusar membro.';
  end if;

  if p_user_id is null then
    raise exception 'ID do usuÃ¡rio nÃ£o informado.';
  end if;

  update public.profiles
  set
    inscription_status = 'rejected',
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Membro nÃ£o encontrado.';
  end if;
end;
$$;


ALTER FUNCTION "public"."forjados_admin_reject_profile_v3"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_reject_profile_v4"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.forjados_admin_is_authorized_v4() then
    raise exception 'Sem permissÃ£o para recusar membros.' using errcode = '42501';
  end if;

  update public.profiles
  set
    inscription_status = 'rejected',
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Perfil nÃ£o encontrado para recusa.' using errcode = 'P0002';
  end if;

  begin
    if to_regclass('public.app_notifications') is not null then
      insert into public.app_notifications (user_id, title, message, type, is_read, created_at)
      values (
        p_user_id,
        'Acesso nÃ£o aprovado',
        'Sua solicitaÃ§Ã£o de acesso ao aplicativo FORJADOS nÃ£o foi aprovada neste momento.',
        'access_rejected',
        false,
        now()
      );
    end if;
  exception when others then
    null;
  end;

  begin
    if to_regclass('public.audit_logs') is not null then
      insert into public.audit_logs (actor_id, action, entity_type, entity_id, description, created_at)
      values (
        auth.uid(),
        'profile_rejected',
        'profile',
        p_user_id::text,
        'Membro recusado pelo painel administrativo.',
        now()
      );
    end if;
  exception when others then
    null;
  end;
end;
$$;


ALTER FUNCTION "public"."forjados_admin_reject_profile_v4"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_reject_profile_v5"("p_user_id" "uuid") RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile public.profiles;
begin
  if not public.forjados_is_admin_v5() then
    raise exception 'Sem permissÃ£o para recusar usuÃ¡rio.' using errcode = '42501';
  end if;

  update public.profiles p
  set inscription_status = 'rejected', updated_at = now()
  where p.id = p_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'UsuÃ¡rio nÃ£o encontrado para recusa.' using errcode = 'P0002';
  end if;

  return v_profile;
end;
$$;


ALTER FUNCTION "public"."forjados_admin_reject_profile_v5"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_soft_delete_record_v1"("p_entity_type" "text", "p_entity_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;

  if not public.forjados_is_admin() then
    raise exception 'Apenas administradores podem excluir histÃ³ricos.';
  end if;

  if length(v_reason) < 3 then
    raise exception 'Informe um motivo com pelo menos 3 caracteres.';
  end if;

  if length(v_reason) > 500 then
    raise exception 'O motivo deve ter no mÃ¡ximo 500 caracteres.';
  end if;

  case p_entity_type
    when 'rides' then
      select ride.driver_id
      into v_user_id
      from public.rides ride
      where ride.id = p_entity_id and ride.deleted_at is null
      for update;

      if not found then raise exception 'Carona nÃ£o encontrada ou jÃ¡ excluÃ­da.'; end if;

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
          delete_reason = 'ExclusÃ£o da carona: ' || v_reason
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

      if not found then raise exception 'LanÃ§amento nÃ£o encontrado ou jÃ¡ excluÃ­do.'; end if;

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

      if not found then raise exception 'Resgate nÃ£o encontrado ou jÃ¡ excluÃ­do.'; end if;

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
            delete_reason = 'ExclusÃ£o do resgate: ' || v_reason
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

      if not found then raise exception 'Pedido nÃ£o encontrado ou jÃ¡ excluÃ­do.'; end if;

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
          delete_reason = 'ExclusÃ£o do pedido de camisas: ' || v_reason,
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

      if not found then raise exception 'Comprovante nÃ£o encontrado ou jÃ¡ excluÃ­do.'; end if;

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
      if v_rows = 0 then raise exception 'PublicaÃ§Ã£o nÃ£o encontrada ou jÃ¡ excluÃ­da.'; end if;

    when 'offers' then
      update public.offers
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason, updated_at = now()
      where id = p_entity_id and deleted_at is null;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then raise exception 'Oferta nÃ£o encontrada ou jÃ¡ excluÃ­da.'; end if;

    when 'service_scale_schedules' then
      update public.service_scale_schedules
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason, updated_at = now()
      where id = p_entity_id and deleted_at is null;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then raise exception 'Escala nÃ£o encontrada ou jÃ¡ excluÃ­da.'; end if;

    when 'automated_messages' then
      update public.automated_messages
      set deleted_at = now(), deleted_by = v_actor_id, delete_reason = v_reason,
          status = case when status = 'scheduled' then 'cancelled' else status end,
          updated_at = now()
      where id = p_entity_id and deleted_at is null;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then raise exception 'Mensagem nÃ£o encontrada ou jÃ¡ excluÃ­da.'; end if;

    else
      raise exception 'Tipo de histÃ³rico nÃ£o permitido: %', p_entity_type;
  end case;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata, created_at
  ) values (
    v_actor_id,
    'history.soft_delete',
    p_entity_type,
    p_entity_id::text,
    'HistÃ³rico retirado da operaÃ§Ã£o normal pelo administrador.',
    jsonb_build_object('reason', v_reason, 'side_effects', v_side_effects),
    now()
  );
end;
$$;


ALTER FUNCTION "public"."forjados_admin_soft_delete_record_v1"("p_entity_type" "text", "p_entity_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_update_member_since_v1"("p_user_id" "uuid", "p_member_since" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_previous_member_since date;
begin
  if not (select private.forjados_has_any_role_v1(array['admin'])) then
    raise exception 'Apenas Administradores podem alterar a data de membro.'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Participante Ã© obrigatÃ³rio.'
      using errcode = '22023';
  end if;

  if p_member_since > current_date then
    raise exception 'A data de membro nÃ£o pode estar no futuro.'
      using errcode = '22023';
  end if;

  select profile.member_since
  into v_previous_member_since
  from public.profiles profile
  where profile.id = p_user_id
    and profile.is_deleted is false;

  if not found then
    raise exception 'Participante nÃ£o encontrado.'
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


ALTER FUNCTION "public"."forjados_admin_update_member_since_v1"("p_user_id" "uuid", "p_member_since" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."forjados_admin_update_member_since_v1"("p_user_id" "uuid", "p_member_since" "date") IS 'Permite ao Administrador corrigir a data Membro desde com trilha de auditoria.';



CREATE OR REPLACE FUNCTION "public"."forjados_admin_update_profile_v3"("p_user_id" "uuid", "p_role" "text" DEFAULT NULL::"text", "p_requested_role" "text" DEFAULT NULL::"text", "p_inscription_status" "text" DEFAULT NULL::"text", "p_sectors" "text"[] DEFAULT NULL::"text"[], "p_primary_team" "text" DEFAULT NULL::"text", "p_display_name" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_city" "text" DEFAULT NULL::"text", "p_neighborhood" "text" DEFAULT NULL::"text", "p_internal_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_new_role text;
begin
  if not public.forjados_current_user_can_manage_v3() then
    raise exception 'Sem permissÃ£o para alterar membro.';
  end if;

  if p_user_id is null then
    raise exception 'ID do usuÃ¡rio nÃ£o informado.';
  end if;

  if p_role is not null and p_role not in ('member', 'leader', 'director', 'treasury', 'admin') then
    raise exception 'Cargo invÃ¡lido: %', p_role;
  end if;

  if p_requested_role is not null and p_requested_role not in ('member', 'leader', 'director', 'treasury', 'admin') then
    raise exception 'Cargo solicitado invÃ¡lido: %', p_requested_role;
  end if;

  if p_inscription_status is not null and p_inscription_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Status invÃ¡lido: %', p_inscription_status;
  end if;

  select coalesce(p_role, p.role)
  into v_new_role
  from public.profiles p
  where p.id = p_user_id;

  if v_new_role is null then
    raise exception 'Membro nÃ£o encontrado.';
  end if;

  update public.profiles
  set
    role = coalesce(p_role, role),
    requested_role = coalesce(p_requested_role, requested_role),
    inscription_status = coalesce(p_inscription_status, inscription_status),
    sectors = coalesce(p_sectors, sectors),
    primary_team = coalesce(p_primary_team, primary_team),
    display_name = coalesce(nullif(p_display_name, ''), display_name),
    full_name = coalesce(nullif(p_display_name, ''), full_name),
    phone = coalesce(p_phone, phone),
    city = coalesce(p_city, city),
    neighborhood = coalesce(p_neighborhood, neighborhood),
    is_admin = case
      when coalesce(p_role, role) = 'admin' then true
      when p_role is not null and p_role <> 'admin' then false
      else coalesce(is_admin, false)
    end,
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Membro nÃ£o encontrado.';
  end if;

  -- Se a funÃ§Ã£o de escala existir no seu banco, mantÃ©m a pessoa sincronizada.
  if to_regprocedure('public.ensure_service_scale_person(uuid)') is not null then
    execute 'select public.ensure_service_scale_person($1)' using p_user_id;
  end if;
end;
$_$;


ALTER FUNCTION "public"."forjados_admin_update_profile_v3"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_update_profile_v4"("p_user_id" "uuid", "p_role" "text" DEFAULT NULL::"text", "p_requested_role" "text" DEFAULT NULL::"text", "p_inscription_status" "text" DEFAULT NULL::"text", "p_sectors" "text"[] DEFAULT NULL::"text"[], "p_primary_team" "text" DEFAULT NULL::"text", "p_display_name" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_city" "text" DEFAULT NULL::"text", "p_neighborhood" "text" DEFAULT NULL::"text", "p_internal_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_requested_role text;
  v_status text;
begin
  if not public.forjados_admin_is_authorized_v4() then
    raise exception 'Sem permissÃ£o para alterar perfis.' using errcode = '42501';
  end if;

  v_role := nullif(p_role, '');
  v_requested_role := nullif(p_requested_role, '');
  v_status := nullif(p_inscription_status, '');

  if v_role is not null and v_role not in ('member', 'leader', 'director', 'treasury', 'admin') then
    raise exception 'Cargo invÃ¡lido: %', v_role using errcode = '22023';
  end if;

  if v_requested_role is not null and v_requested_role not in ('member', 'leader', 'director', 'treasury', 'admin') then
    raise exception 'Cargo solicitado invÃ¡lido: %', v_requested_role using errcode = '22023';
  end if;

  if v_status is not null and v_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Status invÃ¡lido: %', v_status using errcode = '22023';
  end if;

  update public.profiles
  set
    role = coalesce(v_role, role),
    requested_role = coalesce(v_requested_role, requested_role),
    inscription_status = coalesce(v_status, inscription_status),
    sectors = coalesce(p_sectors, sectors),
    primary_team = case when p_primary_team is null then primary_team else nullif(p_primary_team, '') end,
    display_name = coalesce(nullif(p_display_name, ''), display_name),
    full_name = coalesce(nullif(p_display_name, ''), full_name),
    phone = coalesce(nullif(p_phone, ''), phone),
    city = coalesce(nullif(p_city, ''), city),
    neighborhood = coalesce(nullif(p_neighborhood, ''), neighborhood),
    internal_notes = case when p_internal_notes is null then internal_notes else p_internal_notes end,
    is_admin = case
      when v_role = 'admin' then true
      when v_role is not null and v_role <> 'admin' then false
      else is_admin
    end,
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Perfil nÃ£o encontrado para atualizaÃ§Ã£o.' using errcode = 'P0002';
  end if;

  begin
    if to_regclass('public.audit_logs') is not null then
      insert into public.audit_logs (actor_id, action, entity_type, entity_id, description, metadata, created_at)
      values (
        auth.uid(),
        'profile_updated',
        'profile',
        p_user_id::text,
        'Perfil atualizado pelo painel administrativo.',
        jsonb_build_object(
          'role', v_role,
          'requested_role', v_requested_role,
          'inscription_status', v_status,
          'primary_team', p_primary_team,
          'sectors', p_sectors
        ),
        now()
      );
    end if;
  exception when others then
    null;
  end;
end;
$$;


ALTER FUNCTION "public"."forjados_admin_update_profile_v4"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_update_profile_v5"("p_user_id" "uuid", "p_role" "text" DEFAULT NULL::"text", "p_requested_role" "text" DEFAULT NULL::"text", "p_inscription_status" "text" DEFAULT NULL::"text", "p_sectors" "text"[] DEFAULT NULL::"text"[], "p_primary_team" "text" DEFAULT NULL::"text", "p_display_name" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_city" "text" DEFAULT NULL::"text", "p_neighborhood" "text" DEFAULT NULL::"text", "p_internal_notes" "text" DEFAULT NULL::"text") RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_profile public.profiles;
begin
  if not public.forjados_is_admin_v5() then
    raise exception 'Sem permissÃ£o para alterar usuÃ¡rio.' using errcode = '42501';
  end if;

  update public.profiles p
  set
    role = case when nullif(p_role, '') is not null then nullif(p_role, '')::public.user_role else p.role end,
    requested_role = case when nullif(p_requested_role, '') is not null then nullif(p_requested_role, '')::public.user_role else p.requested_role end,
    inscription_status = case
      when nullif(p_inscription_status, '') is null then p.inscription_status
      when p_inscription_status = 'pending' then 'pending'
      when p_inscription_status = 'approved' then 'approved'
      when p_inscription_status = 'rejected' then 'rejected'
      else p.inscription_status
    end,
    sectors = coalesce(p_sectors, p.sectors),
    primary_team = case when p_primary_team is null then p.primary_team else nullif(p_primary_team, '') end,
    display_name = coalesce(nullif(p_display_name, ''), p.display_name),
    full_name = coalesce(nullif(p_display_name, ''), p.full_name, p.display_name),
    phone = coalesce(nullif(p_phone, ''), p.phone),
    city = coalesce(nullif(p_city, ''), p.city),
    neighborhood = coalesce(nullif(p_neighborhood, ''), p.neighborhood),
    is_admin = case
      when coalesce(nullif(p_role, ''), p.role::text, 'member') = 'admin' then true
      when coalesce(nullif(p_role, ''), p.role::text, 'member') <> 'admin' then false
      else coalesce(p.is_admin, false)
    end,
    updated_at = now()
  where p.id = p_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'UsuÃ¡rio nÃ£o encontrado para alteraÃ§Ã£o.' using errcode = 'P0002';
  end if;

  if v_profile.inscription_status::text = 'approved'
     and to_regprocedure('public.ensure_service_scale_person(uuid)') is not null then
    begin
      execute 'select public.ensure_service_scale_person($1)' using p_user_id;
    exception when others then
      raise notice 'ensure_service_scale_person falhou: %', sqlerrm;
    end;
  end if;

  return v_profile;
end;
$_$;


ALTER FUNCTION "public"."forjados_admin_update_profile_v5"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_admin_update_retreat_count_v6"("p_user_id" "uuid", "p_retreat_count" integer) RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile public.profiles;
begin
  if not public.forjados_is_admin_v5() then
    raise exception 'Sem permissÃ£o para alterar retiros.' using errcode = '42501';
  end if;

  update public.profiles
  set retreat_count_manual = greatest(0, coalesce(p_retreat_count, 0)), updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;


ALTER FUNCTION "public"."forjados_admin_update_retreat_count_v6"("p_user_id" "uuid", "p_retreat_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_assign_member_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.member_id is null or trim(new.member_id) = '' then
    if coalesce(new.is_admin, false) = true or new.role::text = 'admin' then
      new.member_id := 'ADM-' || lpad(nextval('public.forjados_adm_id_seq')::text, 2, '0');
    else
      new.member_id := 'EQP-' || lpad(nextval('public.forjados_eqp_id_seq')::text, 3, '0');
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."forjados_assign_member_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_automated_messages_cron_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_exists boolean := false;
  v_active boolean := false;
  v_jobid integer := null;
begin
  if not public.forjados_can_manage_automation() then
    raise exception 'Sem permissÃ£o para visualizar a rotina de automaÃ§Ãµes.' using errcode = '42501';
  end if;

  begin
    select exists(
      select 1
      from cron.job
      where jobname = 'forjados-process-automated-messages'
    ) into v_exists;

    select jobid, active
    into v_jobid, v_active
    from cron.job
    where jobname = 'forjados-process-automated-messages'
    order by jobid desc
    limit 1;
  exception when others then
    v_exists := false;
    v_active := false;
    v_jobid := null;
  end;

  return jsonb_build_object(
    'mode', 'pg_cron',
    'job_name', 'forjados-process-automated-messages',
    'job_exists', v_exists,
    'active', coalesce(v_active, false),
    'job_id', v_jobid,
    'frequency', 'a cada 1 minuto',
    'checked_at', now()
  );
end;
$$;


ALTER FUNCTION "public"."forjados_automated_messages_cron_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_can_manage_automation"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        coalesce(p.is_admin, false) = true
        or p.role::text in ('admin', 'director')
        or p.email = 'forjados.ofc@gmail.com'
      )
  )
  or coalesce(auth.jwt() ->> 'email', '') = 'forjados.ofc@gmail.com';
$$;


ALTER FUNCTION "public"."forjados_can_manage_automation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_can_manage_treasury_v1"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_deleted, false) = false
      and (
        coalesce(p.is_admin, false) = true
        or p.role::text in ('admin', 'director', 'treasury')
        or p.email = 'forjados.ofc@gmail.com'
      )
  )
  or coalesce(auth.jwt() ->> 'email', '') = 'forjados.ofc@gmail.com';
$$;


ALTER FUNCTION "public"."forjados_can_manage_treasury_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_check_in_trail_step_v1"("p_execution_step_id" "uuid", "p_now" timestamp with time zone DEFAULT "clock_timestamp"()) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_step public.trail_route_execution_steps%rowtype;
  v_current public.trail_route_execution_steps%rowtype;
  v_execution public.trail_route_executions%rowtype;
  v_last public.trail_route_execution_steps%rowtype;
  v_station public.trail_map_stations%rowtype;
  v_variance integer;
begin
  select * into v_step
  from public.trail_route_execution_steps
  where id = p_execution_step_id
  for update;
  if not found then raise exception 'Etapa operacional nao encontrada.' using errcode = '22023'; end if;

  select * into v_execution
  from public.trail_route_executions
  where id = v_step.execution_id
  for update;
  if not found or v_execution.run_status <> 'active' then
    raise exception 'A trilha deste grupo nao esta ativa.' using errcode = '22023';
  end if;
  if v_step.step_status = 'current' then return v_step.id; end if;
  if v_step.step_status <> 'pending' then
    raise exception 'Esta etapa ja foi encerrada.' using errcode = '22023';
  end if;

  select * into v_current
  from public.trail_route_execution_steps
  where execution_id = v_execution.id and step_status = 'current'
  order by live_order
  limit 1
  for update;

  if found and v_step.live_order <> v_current.live_order + 1 then
    update public.trail_route_execution_steps
    set live_order = live_order + 1
    where execution_id = v_execution.id
      and step_status = 'pending'
      and live_order > v_current.live_order
      and live_order < v_step.live_order;
    update public.trail_route_execution_steps
    set live_order = v_current.live_order + 1
    where id = v_step.id;
  end if;

  if found then
    update public.trail_route_execution_steps
    set step_status = 'completed', checked_out_at = p_now
    where id = v_current.id;
  end if;

  update public.trail_route_execution_steps
  set step_status = 'current', checked_in_at = p_now, checked_out_at = null, eta_at = p_now
  where id = v_step.id
  returning * into v_step;

  with ordered as (
    select future.id,
      p_now + make_interval(mins => (
        v_step.stay_minutes + v_step.travel_minutes + coalesce(
          sum(future.stay_minutes + future.travel_minutes) over (
            order by future.live_order rows between unbounded preceding and 1 preceding
          ), 0
        )
      )::integer) as next_eta
    from public.trail_route_execution_steps future
    where future.execution_id = v_execution.id
      and future.step_status = 'pending'
      and future.live_order > v_step.live_order
  )
  update public.trail_route_execution_steps future
  set eta_at = ordered.next_eta
  from ordered
  where future.id = ordered.id;

  v_variance := round(extract(epoch from (p_now - v_step.planned_arrival_at)) / 60.0)::integer;
  v_variance := greatest(-720, least(720, v_variance));

  select * into v_last
  from public.trail_route_execution_steps
  where execution_id = v_execution.id and step_status in ('current', 'pending')
  order by live_order desc
  limit 1;

  update public.trail_route_executions
  set schedule_variance_minutes = v_variance,
      estimated_finish_at = v_last.eta_at + make_interval(mins => v_last.stay_minutes)
  where id = v_execution.id;

  select * into v_station from public.trail_map_stations where id = v_step.station_id;
  update public.trail_group_traffic
  set station_id = v_step.station_id,
      origin_station_id = null,
      destination_station_id = null,
      marker_x = coalesce(v_station.x_percent, marker_x),
      marker_y = coalesce(v_station.y_percent, marker_y),
      movement_status = 'at_station',
      traffic_signal = case when v_variance > 10 then 'attention' else 'clear' end,
      delay_minutes = greatest(0, v_variance),
      notes = 'Check-in automatico: ' || v_step.label
  where edition_id = v_execution.edition_id and group_id = v_execution.group_id;

  return v_step.id;
end;
$$;


ALTER FUNCTION "public"."forjados_check_in_trail_step_v1"("p_execution_step_id" "uuid", "p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_claim_push_queue"("p_limit" integer DEFAULT 60) RETURNS TABLE("id" "uuid", "user_id" "uuid", "payload" "jsonb", "attempts" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with picked as (
    select q.id
    from public.push_notification_queue q
    where q.attempts < 5
      and (
        q.status = 'queued'
        or (q.status = 'processing' and q.updated_at < now() - interval '5 minutes')
      )
    order by q.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 60), 100))
  )
  update public.push_notification_queue q
  set status = 'processing',
      updated_at = now()
  from picked
  where q.id = picked.id
  returning q.id, q.user_id, q.payload, q.attempts;
$$;


ALTER FUNCTION "public"."forjados_claim_push_queue"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_clear_my_honor_goal_v1"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '42501';
  end if;

  delete from public.honor_goals goal
  where goal.user_id = v_user_id;

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count > 0 then
    insert into public.audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      description
    ) values (
      v_user_id,
      'honor_goal.cleared',
      'honor_goal',
      v_user_id::text,
      'Meta pessoal de honra removida.'
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."forjados_clear_my_honor_goal_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_clear_my_notification_history_v1"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '28000';
  end if;

  update public.app_notifications notification
  set cleared_at = now()
  where notification.user_id = (select auth.uid())
    and notification.cleared_at is null
    and notification.is_read is true
    and notification.is_pinned is false;
  get diagnostics v_count = row_count;

  insert into public.audit_logs (
    actor_id, action, entity_type, description, metadata
  ) values (
    (select auth.uid()), 'notifications.history_cleared', 'app_notification',
    'HistÃ³rico pessoal de notificaÃ§Ãµes arquivado.', jsonb_build_object('records', v_count)
  );
  return v_count;
end;
$$;


ALTER FUNCTION "public"."forjados_clear_my_notification_history_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_clear_notification_receipts_v1"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_count integer;
begin
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem arquivar confirmaÃ§Ãµes.' using errcode = '42501';
  end if;

  update public.app_notifications notification
  set receipt_archived_at = now()
  where notification.receipt_archived_at is null
    and notification.user_id is not null
    and notification.is_read is true
    and notification.is_pinned is false;
  get diagnostics v_count = row_count;

  insert into public.audit_logs (
    actor_id, action, entity_type, description, metadata
  ) values (
    (select auth.uid()), 'notifications.receipts_archived', 'app_notification',
    'HistÃ³rico de confirmaÃ§Ãµes de leitura arquivado.', jsonb_build_object('records', v_count)
  );
  return v_count;
end;
$$;


ALTER FUNCTION "public"."forjados_clear_notification_receipts_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_configure_push_cron"("p_function_url" "text", "p_frequency" "text" DEFAULT '* * * * *'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_job_id bigint;
  v_function_url constant text := 'https://szmujymzcifxnlladktn.supabase.co/functions/v1/send-push-notifications';
begin
  if not public.forjados_can_manage_automation() then
    raise exception 'Sem permissÃ£o para configurar a rotina de push.' using errcode = '42501';
  end if;

  if coalesce(p_function_url, '') <> v_function_url then
    raise exception 'Endpoint de push invÃ¡lido.' using errcode = '22023';
  end if;

  if coalesce(p_frequency, '') <> '* * * * *' then
    raise exception 'A frequÃªncia de push Ã© fixa em um minuto.' using errcode = '22023';
  end if;

  begin
    perform cron.unschedule('forjados-send-push-notifications');
  exception when others then
    null;
  end;

  select cron.schedule(
    'forjados-send-push-notifications',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://szmujymzcifxnlladktn.supabase.co/functions/v1/send-push-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-forjados-cron-secret', (
            select secret_value
            from public.internal_runtime_secrets
            where secret_name = 'push_cron'
          )
        ),
        body := '{"source":"pg_cron"}'::jsonb,
        timeout_milliseconds := 25000
      );
    $job$
  ) into v_job_id;

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job_id,
    'function_url', v_function_url,
    'frequency', '* * * * *'
  );
end;
$_$;


ALTER FUNCTION "public"."forjados_configure_push_cron"("p_function_url" "text", "p_frequency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_confirm_participation_from_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."forjados_confirm_participation_from_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_create_offer_v1"("p_amount" numeric, "p_method" "text", "p_objective" "text", "p_notes" "text", "p_proof_path" "text", "p_user_name" "text", "p_user_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_offer_id uuid;
  v_user_name text;
  v_user_email text;
begin
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'Valor de oferta invÃ¡lido.';
  end if;
  if p_method not in ('pix', 'card', 'cash', 'other') then
    raise exception 'Forma de oferta invÃ¡lida.';
  end if;
  if nullif(trim(p_objective), '') is null then
    raise exception 'Informe o objetivo da oferta.';
  end if;
  if nullif(p_proof_path, '') is not null then
    if p_proof_path not like (v_user_id::text || '/ofertas/%') then
      raise exception 'Caminho de comprovante invÃ¡lido.';
    end if;
    if not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'payment-receipts'
        and object.name = p_proof_path
    ) then
      raise exception 'O arquivo enviado nÃ£o foi encontrado.';
    end if;
  end if;

  select
    coalesce(nullif(profile.display_name, ''), nullif(p_user_name, ''), 'Participante'),
    coalesce(nullif(profile.email, ''), nullif(p_user_email, ''), auth_user.email, '')
  into v_user_name, v_user_email
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = v_user_id;

  insert into public.offers (
    user_id,
    user_name,
    user_email,
    amount,
    method,
    objective,
    notes,
    proof_url,
    proof_path,
    status
  ) values (
    v_user_id,
    v_user_name,
    v_user_email,
    round(p_amount, 2),
    p_method,
    left(trim(p_objective), 160),
    left(coalesce(p_notes, ''), 2000),
    '',
    nullif(p_proof_path, ''),
    'pending'
  )
  returning id into v_offer_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'offer_created',
    'offer',
    v_offer_id::text,
    'Oferta registrada.',
    jsonb_build_object('amount', round(p_amount, 2), 'method', p_method)
  );

  return v_offer_id;
end;
$$;


ALTER FUNCTION "public"."forjados_create_offer_v1"("p_amount" numeric, "p_method" "text", "p_objective" "text", "p_notes" "text", "p_proof_path" "text", "p_user_name" "text", "p_user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_create_shirt_order_v1"("p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
    or jsonb_array_length(p_items) > 50 then
    raise exception 'Carrinho invÃ¡lido.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by value->>'shirt_id', value->>'size'
  loop
    begin
      v_shirt_id := (v_item->>'shirt_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Item de carrinho invÃ¡lido.';
    end;

    v_size := upper(trim(coalesce(v_item->>'size', '')));
    if v_quantity < 1 or v_quantity > 20 or v_size = '' then
      raise exception 'Quantidade ou tamanho invÃ¡lido.';
    end if;

    v_key := v_shirt_id::text || ':' || v_size;
    if v_key = any(v_seen) then
      raise exception 'O carrinho contÃ©m itens duplicados.';
    end if;
    v_seen := array_append(v_seen, v_key);

    select shirt.name, shirt.price, shirt.stock, shirt.is_active
    into v_name, v_price, v_stock, v_active
    from public.shirts shirt
    where shirt.id = v_shirt_id
      and shirt.deleted_at is null
    for update;

    if not found or not v_active then
      raise exception 'Uma das camisas nÃ£o estÃ¡ disponÃ­vel.';
    end if;
    if v_price < 0 then
      raise exception 'Uma das camisas possui preÃ§o invÃ¡lido.';
    end if;

    begin
      v_stock_quantity := coalesce((v_stock->>v_size)::integer, 0);
    exception when others then
      raise exception 'Estoque invÃ¡lido para % / %.', v_name, v_size;
    end;

    if v_stock_quantity < v_quantity then
      raise exception 'Estoque insuficiente para % / %.', v_name, v_size;
    end if;

    v_total := v_total + (v_price * v_quantity);
  end loop;

  insert into public.shirt_orders (user_id, total_price, status)
  values (v_user_id, v_total, 'waiting_payment'::public.order_status)
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by value->>'shirt_id', value->>'size'
  loop
    v_shirt_id := (v_item->>'shirt_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_size := upper(trim(v_item->>'size'));

    select shirt.name, shirt.price, shirt.stock
    into v_name, v_price, v_stock
    from public.shirts shirt
    where shirt.id = v_shirt_id;

    v_stock_quantity := coalesce((v_stock->>v_size)::integer, 0);

    insert into public.shirt_order_items (
      order_id, shirt_id, name, size, quantity, price
    ) values (
      v_order_id, v_shirt_id, v_name, v_size, v_quantity, v_price
    );

    update public.shirts
    set stock = jsonb_set(
          stock,
          array[v_size],
          to_jsonb(v_stock_quantity - v_quantity),
          true
        ),
        updated_at = now()
    where id = v_shirt_id;
  end loop;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'shirt_order_created',
    'shirt_order',
    v_order_id::text,
    'Pedido de camisas criado com estoque reservado.',
    jsonb_build_object('amount', v_total, 'items', jsonb_array_length(p_items))
  );

  return v_order_id;
end;
$$;


ALTER FUNCTION "public"."forjados_create_shirt_order_v1"("p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_current_user_can_manage_v3"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.inscription_status, 'pending') = 'approved'
      and (
        coalesce(p.is_admin, false) = true
        or p.role in ('admin', 'director')
      )
  );
$$;


ALTER FUNCTION "public"."forjados_current_user_can_manage_v3"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_ensure_my_profile_v1"() RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_auth_user auth.users%rowtype;
  v_profile public.profiles%rowtype;
  v_display_name text;
  v_requested_role public.user_role;
begin
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  if found then
    return v_profile;
  end if;

  select *
  into v_auth_user
  from auth.users
  where id = v_user_id;

  if not found then
    raise exception 'UsuÃ¡rio de autenticaÃ§Ã£o nÃ£o encontrado.';
  end if;

  v_display_name := coalesce(
    nullif(trim(v_auth_user.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(v_auth_user.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(v_auth_user.email, ''), '@', 1),
    'Novo usuÃ¡rio'
  );

  if v_auth_user.raw_user_meta_data->>'requested_role'
    in ('member', 'leader', 'director', 'treasury') then
    v_requested_role := (v_auth_user.raw_user_meta_data->>'requested_role')::public.user_role;
  else
    v_requested_role := 'member'::public.user_role;
  end if;

  insert into public.profiles (
    id,
    email,
    display_name,
    full_name,
    role,
    requested_role,
    inscription_status,
    is_admin,
    member_id,
    sectors,
    primary_team,
    has_vehicle,
    skills,
    points,
    terms_accepted
  ) values (
    v_user_id,
    coalesce(v_auth_user.email, ''),
    left(v_display_name, 160),
    left(v_display_name, 160),
    'member'::public.user_role,
    v_requested_role,
    'pending'::public.inscription_status,
    false,
    'EQP-' || upper(left(replace(v_user_id::text, '-', ''), 10)),
    array[]::text[],
    null,
    false,
    array[]::text[],
    0,
    '{}'::jsonb
  )
  on conflict (id) do nothing;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'NÃ£o foi possÃ­vel preparar o perfil.';
  end if;

  return v_profile;
end;
$$;


ALTER FUNCTION "public"."forjados_ensure_my_profile_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_finish_account_deletion_v1"("p_receipt_id" "uuid", "p_success" boolean, "p_failure_code" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'OperaÃ§Ã£o restrita ao serviÃ§o de exclusÃ£o.';
  end if;

  update public.account_deletion_receipts
  set status = case when p_success then 'completed' else 'failed' end,
      completed_at = case when p_success then now() else null end,
      failure_code = case when p_success then null else left(coalesce(p_failure_code, 'unknown'), 120) end,
      updated_at = now()
  where id = p_receipt_id;
end;
$$;


ALTER FUNCTION "public"."forjados_finish_account_deletion_v1"("p_receipt_id" "uuid", "p_success" boolean, "p_failure_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_finish_trail_route_v1"("p_group_id" "uuid", "p_now" timestamp with time zone DEFAULT "clock_timestamp"()) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_execution public.trail_route_executions%rowtype;
begin
  select * into v_execution
  from public.trail_route_executions
  where group_id = p_group_id
  for update;
  if not found or v_execution.run_status <> 'active' then
    raise exception 'A trilha deste grupo nao esta ativa.' using errcode = '22023';
  end if;

  update public.trail_route_execution_steps
  set step_status = 'completed', checked_out_at = p_now
  where execution_id = v_execution.id and step_status = 'current';

  update public.trail_route_execution_steps
  set step_status = 'skipped'
  where execution_id = v_execution.id and step_status = 'pending';

  update public.trail_route_executions
  set run_status = 'finished', finished_at = p_now, estimated_finish_at = p_now
  where id = v_execution.id;

  update public.trail_group_traffic
  set movement_status = 'finished', traffic_signal = 'clear', notes = 'Trilha encerrada.'
  where edition_id = v_execution.edition_id and group_id = p_group_id;

  return v_execution.id;
end;
$$;


ALTER FUNCTION "public"."forjados_finish_trail_route_v1"("p_group_id" "uuid", "p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_get_my_inscription_overview_v1"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '42501';
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


ALTER FUNCTION "public"."forjados_get_my_inscription_overview_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
      and coalesce(p.is_deleted, false) = false
  );
$$;


ALTER FUNCTION "public"."forjados_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_is_admin_or_director"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."forjados_is_admin_or_director"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_is_admin_v5"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_deleted, false) = false
      and (
        coalesce(p.is_admin, false) = true
        or p.role::text in ('admin', 'director')
        or p.email = 'forjados.ofc@gmail.com'
      )
  )
  or coalesce(auth.jwt() ->> 'email', '') = 'forjados.ofc@gmail.com';
$$;


ALTER FUNCTION "public"."forjados_is_admin_v5"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_list_attendance_v1"("p_edition_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("participation_id" "uuid", "user_id" "uuid", "user_name" "text", "user_email" "text", "edition_id" "uuid", "retreat_title" "text", "attendance_status" "text", "attendance_notes" "text", "attendance_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_edition_id uuid := p_edition_id;
begin
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem consultar presenÃ§a.' using errcode = '42501';
  end if;
  if v_edition_id is null then
    select event.id into v_edition_id
    from public.retreat_events event
    where event.active is true order by event.start_date desc limit 1;
  end if;
  return query
  select participation.id, profile.id,
    coalesce(nullif(profile.display_name, ''), profile.email), profile.email,
    participation.edition_id, participation.retreat_title,
    participation.attendance_status, coalesce(participation.attendance_notes, ''),
    participation.attendance_updated_at
  from public.retreat_participations participation
  join public.profiles profile on profile.id = participation.user_id
  where (v_edition_id is null or participation.edition_id = v_edition_id)
    and profile.is_deleted is false
  order by coalesce(nullif(profile.display_name, ''), profile.email);
end;
$$;


ALTER FUNCTION "public"."forjados_list_attendance_v1"("p_edition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_list_attendance_v2"("p_edition_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("participation_id" "uuid", "enrollment_id" "uuid", "user_id" "uuid", "user_name" "text", "user_email" "text", "edition_id" "uuid", "retreat_title" "text", "attendance_status" "text", "attendance_notes" "text", "attendance_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_edition_id uuid := p_edition_id;
begin
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem consultar presenÃ§a.'
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


ALTER FUNCTION "public"."forjados_list_attendance_v2"("p_edition_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."forjados_list_attendance_v2"("p_edition_id" "uuid") IS 'Lista confirmaÃ§Ãµes da ediÃ§Ã£o para controle administrativo de presenÃ§a fÃ­sica.';



CREATE OR REPLACE FUNCTION "public"."forjados_list_material_editions_v1"() RETURNS TABLE("id" "uuid", "title" "text", "starts_at" timestamp with time zone, "is_active" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select distinct edition.id, edition.title, edition.starts_at, edition.is_active
  from public.forjados_editions edition
  where (select private.forjados_has_any_role_v1(array['admin', 'director']))
     or edition.is_active is true
  order by edition.starts_at desc;
$$;


ALTER FUNCTION "public"."forjados_list_material_editions_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_list_material_sectors_v1"("p_edition_id" "uuid") RETURNS TABLE("id" "uuid", "edition_id" "uuid", "name" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select unit.id, unit.edition_id, unit.name
  from public.event_service_units unit
  where unit.edition_id = p_edition_id
    and unit.unit_type = 'sector'
    and unit.is_active is true
    and private.forjados_can_manage_material_sector_v1(unit.edition_id, unit.id)
  order by unit.display_order, unit.name;
$$;


ALTER FUNCTION "public"."forjados_list_material_sectors_v1"("p_edition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_list_notification_receipts_v1"("p_limit" integer DEFAULT 250) RETURNS TABLE("id" "uuid", "title" "text", "message" "text", "type" "text", "is_read" boolean, "read_at" timestamp with time zone, "created_at" timestamp with time zone, "recipient_id" "uuid", "recipient_name" "text", "recipient_email" "text", "recipient_role" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if (select auth.uid()) is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '28000';
  end if;
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem consultar confirmaÃ§Ãµes de leitura.' using errcode = '42501';
  end if;

  return query
  select notification.id, notification.title, notification.message,
    notification.type, notification.is_read, notification.read_at,
    notification.created_at, notification.user_id,
    coalesce(nullif(profile.display_name, ''), profile.email, 'UsuÃ¡rio'),
    coalesce(profile.email, ''), coalesce(profile.role::text, 'member')
  from public.app_notifications notification
  left join public.profiles profile on profile.id = notification.user_id
  where notification.user_id is not null
    and notification.receipt_archived_at is null
  order by notification.created_at desc
  limit least(greatest(coalesce(p_limit, 250), 1), 500);
end;
$$;


ALTER FUNCTION "public"."forjados_list_notification_receipts_v1"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("schedule_id" "uuid", "schedule_title" "text", "scale_type" "text", "service_unit_id" "uuid", "assignment_id" "uuid", "user_id" "uuid", "person_name" "text", "gender" "text", "slot_number" integer, "slot_start" timestamp with time zone, "slot_end" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select *
  from private.forjados_list_published_service_scales_v1(p_edition_id);
$$;


ALTER FUNCTION "public"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid") IS 'Wrapper SECURITY INVOKER que expÃµe apenas o resumo seguro das escalas publicadas.';



CREATE OR REPLACE FUNCTION "public"."forjados_list_retreat_birthdays_v1"() RETURNS SETOF "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_start date;
  v_end date;
begin
  if not public.forjados_is_admin_or_director() then
    raise exception 'Sem permissÃ£o para visualizar aniversariantes.' using errcode = '42501';
  end if;

  select start_date::date, coalesce(end_date::date, start_date::date)
  into v_start, v_end
  from public.retreat_events
  where active = true
  order by start_date asc
  limit 1;

  if v_start is null then
    return;
  end if;

  return query
  select p.*
  from public.profiles p
  where p.birth_date is not null
    and coalesce(p.is_deleted, false) = false
    and p.inscription_status::text = 'approved'
    and make_date(
      extract(year from v_start)::int,
      extract(month from p.birth_date)::int,
      extract(day from p.birth_date)::int
    ) between v_start and v_end
  order by p.display_name;
end;
$$;


ALTER FUNCTION "public"."forjados_list_retreat_birthdays_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_list_schedule_people_v1"() RETURNS TABLE("user_id" "uuid", "display_name" "text", "email" "text", "role" "text", "primary_team" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem montar o cronograma.' using errcode = '42501';
  end if;
  return query
  select profile.id,
    coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email),
    profile.email, profile.role::text, coalesce(profile.primary_team, '')
  from public.profiles profile
  where profile.inscription_status::text = 'approved'
    and profile.is_deleted is false
  order by coalesce(nullif(profile.display_name, ''), profile.email);
end;
$$;


ALTER FUNCTION "public"."forjados_list_schedule_people_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_list_service_people_v1"() RETURNS TABLE("user_id" "uuid", "display_name" "text", "email" "text", "role" "text", "primary_team" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if (select auth.uid()) is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '28000';
  end if;
  if not (
    (select private.forjados_has_any_role_v1(array['admin', 'director', 'leader']))
    or exists (
      select 1 from public.event_service_assignments assignment
      where assignment.user_id = (select auth.uid()) and assignment.is_leader is true
    )
  ) then
    raise exception 'Acesso permitido somente a gestores e lÃ­deres de setor.' using errcode = '42501';
  end if;

  return query
  select profile.id,
         coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), profile.email),
         profile.email,
         profile.role::text,
         coalesce(profile.primary_team, '')
  from public.profiles profile
  where profile.inscription_status::text = 'approved'
    and coalesce(profile.is_deleted, false) is false
  order by coalesce(nullif(profile.display_name, ''), profile.email);
end;
$$;


ALTER FUNCTION "public"."forjados_list_service_people_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_mark_all_my_notifications_read_v1"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '28000';
  end if;

  update public.app_notifications notification
  set is_read = true, read_at = coalesce(notification.read_at, now())
  where notification.user_id = (select auth.uid())
    and notification.cleared_at is null
    and notification.is_read is false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."forjados_mark_all_my_notifications_read_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_mark_my_notification_v1"("p_notification_id" "uuid", "p_is_read" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if (select auth.uid()) is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '28000';
  end if;

  update public.app_notifications notification
  set
    is_read = coalesce(p_is_read, true),
    read_at = case when coalesce(p_is_read, true) then coalesce(notification.read_at, now()) else null end
  where notification.id = p_notification_id
    and notification.user_id = (select auth.uid())
    and notification.cleared_at is null;

  if not found then
    raise exception 'NotificaÃ§Ã£o nÃ£o encontrada.' using errcode = 'P0002';
  end if;
end;
$$;


ALTER FUNCTION "public"."forjados_mark_my_notification_v1"("p_notification_id" "uuid", "p_is_read" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_notify_new_store_item_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    when tg_table_name = 'shirts' then 'Nova camisa disponÃ­vel'
    else 'Novo item na Loja de Honra'
  end;

  insert into public.app_notifications (user_id, title, message, type)
  select
    profile.id,
    v_title,
    left(format('%s jÃ¡ estÃ¡ disponÃ­vel na %s.', new.name, v_store_name), 2000),
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
    'Novo item de loja publicado e comunicado aos usuÃ¡rios aprovados.',
    jsonb_build_object('store', v_store_name, 'product_name', new.name)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."forjados_notify_new_store_item_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_prepare_account_deletion_v1"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_receipt_id uuid;
  v_storage_objects jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if p_user_id is null then
    raise exception 'UsuÃ¡rio invÃ¡lido.';
  end if;

  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'OperaÃ§Ã£o restrita ao serviÃ§o de exclusÃ£o.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Conta nÃ£o encontrada.';
  end if;

  select jsonb_build_object(
    'enrollments', (
      select count(*) from public.edition_enrollments where user_id = p_user_id
    ),
    'approved_payments', (
      select count(*) from public.payment_receipts
      where user_id = p_user_id and status::text = 'approved'
    ),
    'approved_payment_total', (
      select coalesce(sum(amount), 0) from public.payment_receipts
      where user_id = p_user_id and status::text = 'approved'
    ),
    'shirt_orders', (
      select count(*) from public.shirt_orders where user_id = p_user_id
    ),
    'shirt_order_total', (
      select coalesce(sum(total_price), 0) from public.shirt_orders where user_id = p_user_id
    ),
    'approved_offers', (
      select count(*) from public.offers
      where user_id = p_user_id and status = 'approved'
    ),
    'approved_offer_total', (
      select coalesce(sum(amount), 0) from public.offers
      where user_id = p_user_id and status = 'approved'
    ),
    'terms_version', (
      select coalesce(terms_accepted ->> 'version', terms_accepted ->> 'terms_version', '')
      from public.profiles where id = p_user_id
    ),
    'terms_accepted_at', (
      select coalesce(terms_accepted ->> 'accepted_at', terms_accepted ->> 'terms_accepted_at', '')
      from public.profiles where id = p_user_id
    )
  ) into v_summary;

  select coalesce(
    jsonb_agg(jsonb_build_object('bucket', owned.bucket_id, 'path', owned.name)),
    '[]'::jsonb
  )
  into v_storage_objects
  from (
    select distinct object_row.bucket_id, object_row.name
    from storage.objects object_row
    where object_row.owner = p_user_id
       or object_row.owner_id = p_user_id::text
       or object_row.name like p_user_id::text || '/%'
  ) owned;

  insert into public.account_deletion_receipts (retained_summary)
  values (v_summary)
  returning id into v_receipt_id;

  return jsonb_build_object(
    'receipt_id', v_receipt_id,
    'storage_objects', v_storage_objects
  );
end;
$$;


ALTER FUNCTION "public"."forjados_prepare_account_deletion_v1"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_prepare_ride_points_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_settings public.ride_settings%rowtype;
begin
  select * into v_settings from public.ride_settings where singleton is true;
  if v_settings.points_mode = 'fixed' then
    new.estimated_points := v_settings.fixed_points;
  else
    new.estimated_points := greatest(new.total_seats, 0) * v_settings.points_per_passenger;
  end if;
  new.points_rule_snapshot := jsonb_build_object(
    'mode', v_settings.points_mode,
    'points_per_passenger', v_settings.points_per_passenger,
    'fixed_points', v_settings.fixed_points
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."forjados_prepare_ride_points_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_process_due_automated_messages"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."forjados_process_due_automated_messages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_protect_profile_member_since_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.member_since is distinct from old.member_since
    and (select auth.uid()) is not null
    and not public.is_director_or_admin()
  then
    new.member_since := old.member_since;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."forjados_protect_profile_member_since_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_purge_expired_account_deletion_receipts_v1"() RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_deleted bigint;
begin
  delete from public.account_deletion_receipts
  where retain_until <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


ALTER FUNCTION "public"."forjados_purge_expired_account_deletion_receipts_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_push_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_subscriptions integer;
  v_queue integer;
  v_sent integer;
  v_failed integer;
begin
  if not public.forjados_can_manage_automation() then
    raise exception 'Sem permissÃ£o para visualizar o status de push.' using errcode = '42501';
  end if;

  select count(*) into v_subscriptions
  from public.web_push_subscriptions
  where is_active = true;

  select count(*) into v_queue
  from public.push_notification_queue
  where status in ('queued', 'processing');

  select count(*) into v_sent
  from public.push_notification_queue
  where status = 'sent';

  select count(*) into v_failed
  from public.push_notification_queue
  where status = 'failed';

  return jsonb_build_object(
    'active_subscriptions', v_subscriptions,
    'queued', v_queue,
    'sent', v_sent,
    'failed', v_failed,
    'checked_at', now()
  );
end;
$$;


ALTER FUNCTION "public"."forjados_push_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_queue_push_from_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.push_notification_queue (
    notification_id,
    user_id,
    payload,
    status
  )
  values (
    new.id,
    new.user_id,
    jsonb_build_object(
      'notification_id', new.id,
      'title', coalesce(new.title, 'FORJADOS'),
      'message', coalesce(new.message, ''),
      'type', coalesce(new.type, 'notification'),
      'url', '/?tab=notifications',
      'icon', '/icons/icon-192.png',
      'badge', '/icons/icon-192.png'
    ),
    'queued'
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."forjados_queue_push_from_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_register_material_movement_v1"("p_item_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_borrower" "text" DEFAULT ''::"text", "p_due_date" "date" DEFAULT NULL::"date", "p_notes" "text" DEFAULT ''::"text") RETURNS "public"."material_movements"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.forjados_register_material_movement_v1(
    p_item_id, p_movement_type, p_quantity, p_borrower, p_due_date, p_notes
  );
$$;


ALTER FUNCTION "public"."forjados_register_material_movement_v1"("p_item_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_borrower" "text", "p_due_date" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_register_push_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_subscription_id uuid;
begin
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '28000';
  end if;

  if coalesce(length(p_endpoint), 0) < 20
    or length(p_endpoint) > 4096
    or p_endpoint !~ '^https://'
  then
    raise exception 'Endpoint de notificaÃ§Ã£o invÃ¡lido.' using errcode = '22023';
  end if;

  if coalesce(length(p_p256dh), 0) < 20 or length(p_p256dh) > 512 then
    raise exception 'Chave de assinatura invÃ¡lida.' using errcode = '22023';
  end if;

  if coalesce(length(p_auth), 0) < 8 or length(p_auth) > 512 then
    raise exception 'AutorizaÃ§Ã£o da assinatura invÃ¡lida.' using errcode = '22023';
  end if;

  insert into public.web_push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    subscription,
    user_agent,
    is_active,
    updated_at
  )
  values (
    v_user_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    jsonb_build_object(
      'endpoint', p_endpoint,
      'expirationTime', null,
      'keys', jsonb_build_object('p256dh', p_p256dh, 'auth', p_auth)
    ),
    left(coalesce(p_user_agent, ''), 1000),
    true,
    now()
  )
  on conflict (endpoint) do update
  set user_id = v_user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      subscription = excluded.subscription,
      user_agent = excluded.user_agent,
      is_active = true,
      updated_at = now()
  returning id into v_subscription_id;

  return v_subscription_id;
end;
$$;


ALTER FUNCTION "public"."forjados_register_push_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_reorder_trail_execution_v1"("p_execution_id" "uuid", "p_step_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_expected integer;
  v_base integer;
  v_current public.trail_route_execution_steps%rowtype;
  v_last public.trail_route_execution_steps%rowtype;
  v_anchor timestamptz;
begin
  perform 1 from public.trail_route_executions
  where id = p_execution_id and run_status = 'active'
  for update;
  if not found then raise exception 'Execucao ativa nao encontrada.' using errcode = '22023'; end if;

  select count(*) into v_expected
  from public.trail_route_execution_steps
  where execution_id = p_execution_id and step_status = 'pending';

  if coalesce(array_length(p_step_ids, 1), 0) <> v_expected
     or (select count(distinct item) from unnest(p_step_ids) item) <> v_expected
     or exists (
       select 1 from unnest(p_step_ids) item
       where not exists (
         select 1 from public.trail_route_execution_steps step
         where step.id = item and step.execution_id = p_execution_id and step.step_status = 'pending'
       )
     ) then
    raise exception 'A nova ordem deve conter todas as etapas pendentes exatamente uma vez.' using errcode = '22023';
  end if;

  select coalesce(max(live_order), 0) into v_base
  from public.trail_route_execution_steps
  where execution_id = p_execution_id and step_status <> 'pending';

  update public.trail_route_execution_steps step
  set live_order = v_base + ordered.position::integer
  from unnest(p_step_ids) with ordinality ordered(id, position)
  where step.id = ordered.id and step.execution_id = p_execution_id;

  select * into v_current
  from public.trail_route_execution_steps
  where execution_id = p_execution_id and step_status = 'current'
  limit 1;

  if found then
    v_anchor := greatest(
      clock_timestamp(),
      v_current.checked_in_at + make_interval(mins => v_current.stay_minutes)
    ) + make_interval(mins => v_current.travel_minutes);

    with ordered as (
      select pending.id,
        v_anchor + make_interval(mins => coalesce(
          sum(pending.stay_minutes + pending.travel_minutes) over (
            order by pending.live_order rows between unbounded preceding and 1 preceding
          ), 0
        )::integer) as next_eta
      from public.trail_route_execution_steps pending
      where pending.execution_id = p_execution_id and pending.step_status = 'pending'
    )
    update public.trail_route_execution_steps pending
    set eta_at = ordered.next_eta
    from ordered where pending.id = ordered.id;
  end if;

  select * into v_last
  from public.trail_route_execution_steps
  where execution_id = p_execution_id and step_status in ('current', 'pending')
  order by live_order desc limit 1;

  update public.trail_route_executions
  set estimated_finish_at = v_last.eta_at + make_interval(mins => v_last.stay_minutes)
  where id = p_execution_id;
end;
$$;


ALTER FUNCTION "public"."forjados_reorder_trail_execution_v1"("p_execution_id" "uuid", "p_step_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_reorder_trail_route_plan_v1"("p_plan_id" "uuid", "p_step_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_expected integer;
begin
  select count(*) into v_expected
  from public.trail_route_plan_steps
  where plan_id = p_plan_id;

  if coalesce(array_length(p_step_ids, 1), 0) <> v_expected
     or (select count(distinct item) from unnest(p_step_ids) item) <> v_expected
     or exists (
       select 1 from unnest(p_step_ids) item
       where not exists (
         select 1 from public.trail_route_plan_steps step
         where step.id = item and step.plan_id = p_plan_id
       )
     ) then
    raise exception 'A nova ordem deve conter todas as etapas exatamente uma vez.' using errcode = '22023';
  end if;

  update public.trail_route_plan_steps step
  set ideal_order = ordered.position::integer
  from unnest(p_step_ids) with ordinality ordered(id, position)
  where step.id = ordered.id and step.plan_id = p_plan_id;
end;
$$;


ALTER FUNCTION "public"."forjados_reorder_trail_route_plan_v1"("p_plan_id" "uuid", "p_step_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_reset_trail_routes_v1"("p_edition_id" "uuid", "p_group_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_group_id uuid;
  v_target_count integer;
begin
  select count(*) into v_target_count
  from public.trail_route_plans plan
  where plan.edition_id = p_edition_id
    and (p_group_id is null or plan.group_id = p_group_id);

  if v_target_count = 0 then
    raise exception 'Nenhuma rota autorizada foi encontrada para reiniciar.' using errcode = '22023';
  end if;

  -- Serializa reset/inÃ­cio por grupo para impedir duas operaÃ§Ãµes simultÃ¢neas.
  for v_group_id in
    select plan.group_id
    from public.trail_route_plans plan
    where plan.edition_id = p_edition_id
      and (p_group_id is null or plan.group_id = p_group_id)
    order by plan.group_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_group_id::text, 0));
  end loop;

  delete from public.trail_route_executions execution
  using public.trail_route_plans plan
  where execution.edition_id = plan.edition_id
    and execution.group_id = plan.group_id
    and plan.edition_id = p_edition_id
    and (p_group_id is null or plan.group_id = p_group_id);

  insert into public.trail_group_traffic (
    edition_id,
    group_id,
    station_id,
    origin_station_id,
    destination_station_id,
    marker_x,
    marker_y,
    movement_status,
    traffic_signal,
    delay_minutes,
    notes
  )
  select
    target.edition_id,
    target.group_id,
    field.id,
    null,
    null,
    least(96, field.x_percent + ((target.marker_order - 1) * 2.2)),
    least(96, field.y_percent + ((target.marker_order - 1) * 1.4)),
    'not_started',
    'clear',
    0,
    'OperaÃ§Ã£o reiniciada. Grupo aguardando no Campo.'
  from (
    select ranked.edition_id, ranked.group_id, ranked.marker_order
    from (
      select
        plan.edition_id,
        plan.group_id,
        row_number() over (
          partition by plan.edition_id
          order by unit.display_order, unit.name, unit.id
        ) as marker_order
      from public.trail_route_plans plan
      join public.event_service_units unit on unit.id = plan.group_id
      where plan.edition_id = p_edition_id
    ) ranked
    where p_group_id is null or ranked.group_id = p_group_id
  ) target
  join public.trail_map_stations field
    on field.edition_id = target.edition_id
   and field.station_key = 'field'
   and field.is_active is true
  on conflict (edition_id, group_id) do update
  set station_id = excluded.station_id,
      origin_station_id = null,
      destination_station_id = null,
      marker_x = excluded.marker_x,
      marker_y = excluded.marker_y,
      movement_status = excluded.movement_status,
      traffic_signal = excluded.traffic_signal,
      delay_minutes = excluded.delay_minutes,
      notes = excluded.notes;

  return v_target_count;
end;
$$;


ALTER FUNCTION "public"."forjados_reset_trail_routes_v1"("p_edition_id" "uuid", "p_group_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."forjados_reset_trail_routes_v1"("p_edition_id" "uuid", "p_group_id" "uuid") IS 'Remove a execuÃ§Ã£o atual de um ou todos os grupos de uma ediÃ§Ã£o e os devolve ao Campo, preservando as rotas ideais.';



CREATE OR REPLACE FUNCTION "public"."forjados_review_offer_v1"("p_offer_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_current_status text;
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']) then
    raise exception 'Acesso negado.';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Status invÃ¡lido.';
  end if;

  select status
  into v_current_status
  from public.offers
  where id = p_offer_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Oferta nÃ£o encontrada.';
  end if;
  if v_current_status = p_status then
    return;
  end if;
  if v_current_status <> 'pending' then
    raise exception 'Esta oferta jÃ¡ foi analisada.';
  end if;

  update public.offers
  set status = p_status,
      reviewed_by = v_actor_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_offer_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    'offer_reviewed',
    'offer',
    p_offer_id::text,
    'Oferta analisada.',
    jsonb_build_object('status', p_status)
  );
end;
$$;


ALTER FUNCTION "public"."forjados_review_offer_v1"("p_offer_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_review_payment_receipt_v1"("p_receipt_id" "uuid", "p_status" "text", "p_observations" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_receipt public.payment_receipts%rowtype;
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']) then
    raise exception 'Acesso negado.';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Status invÃ¡lido.';
  end if;

  select *
  into v_receipt
  from public.payment_receipts
  where id = p_receipt_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Comprovante nÃ£o encontrado.';
  end if;
  if v_receipt.status::text = p_status then
    return;
  end if;
  if v_receipt.status::text <> 'pending' then
    raise exception 'Este comprovante jÃ¡ foi analisado.';
  end if;

  update public.payment_receipts
  set status = p_status::public.receipt_status,
      observations = left(coalesce(p_observations, ''), 2000),
      reviewed_by = v_actor_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_receipt_id;

  if v_receipt.type = 'inscription' and v_receipt.edition_id is not null then
    insert into public.edition_enrollments (
      edition_id,
      user_id,
      amount,
      enrollment_status,
      payment_status,
      paid_at,
      approved_by,
      approved_at
    ) values (
      v_receipt.edition_id,
      v_receipt.user_id,
      v_receipt.amount,
      case when p_status = 'approved' then 'approved' else 'pending' end,
      p_status,
      case when p_status = 'approved' then now() else null end,
      case when p_status = 'approved' then v_actor_id else null end,
      case when p_status = 'approved' then now() else null end
    )
    on conflict (edition_id, user_id) do update
      set amount = excluded.amount,
          enrollment_status = excluded.enrollment_status,
          payment_status = excluded.payment_status,
          paid_at = excluded.paid_at,
          approved_by = excluded.approved_by,
          approved_at = excluded.approved_at,
          updated_at = now();
  elsif v_receipt.type = 'order' and v_receipt.order_id is not null then
    update public.shirt_orders
    set status = case
          when p_status = 'approved' then 'payment_approved'::public.order_status
          else 'payment_rejected'::public.order_status
        end,
        updated_at = now()
    where id = v_receipt.order_id
      and status = 'receipt_sent'::public.order_status;
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    'payment_receipt_reviewed',
    'payment_receipt',
    p_receipt_id::text,
    'Comprovante financeiro analisado.',
    jsonb_build_object(
      'status', p_status,
      'type', v_receipt.type,
      'edition_id', v_receipt.edition_id,
      'order_id', v_receipt.order_id
    )
  );
end;
$$;


ALTER FUNCTION "public"."forjados_review_payment_receipt_v1"("p_receipt_id" "uuid", "p_status" "text", "p_observations" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_review_shirt_order_v1"("p_order_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_order public.shirt_orders%rowtype;
  v_item record;
  v_stock jsonb;
  v_stock_quantity integer;
  v_size text;
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director', 'treasury']) then
    raise exception 'Acesso negado.';
  end if;
  if p_status not in ('payment_approved', 'payment_rejected', 'delivered', 'cancelled') then
    raise exception 'Status invÃ¡lido.';
  end if;

  select *
  into v_order
  from public.shirt_orders
  where id = p_order_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Pedido nÃ£o encontrado.';
  end if;
  if v_order.status::text = p_status then
    return;
  end if;

  if p_status in ('payment_approved', 'payment_rejected')
    and v_order.status::text <> 'receipt_sent' then
    raise exception 'O pedido nÃ£o estÃ¡ aguardando anÃ¡lise de comprovante.';
  elsif p_status = 'delivered'
    and v_order.status::text <> 'payment_approved' then
    raise exception 'Somente pedidos pagos podem ser entregues.';
  elsif p_status = 'cancelled'
    and v_order.status::text not in ('waiting_payment', 'receipt_sent', 'payment_rejected') then
    raise exception 'Este pedido nÃ£o pode ser cancelado neste status.';
  end if;

  if p_status = 'cancelled' then
    for v_item in
      select item.shirt_id, item.size, item.quantity
      from public.shirt_order_items item
      where item.order_id = p_order_id
        and item.shirt_id is not null
      order by item.shirt_id, item.size
    loop
      v_size := upper(trim(v_item.size));

      select shirt.stock
      into v_stock
      from public.shirts shirt
      where shirt.id = v_item.shirt_id
      for update;

      if found then
        v_stock_quantity := coalesce((v_stock->>v_size)::integer, 0);
        update public.shirts
        set stock = jsonb_set(
              stock,
              array[v_size],
              to_jsonb(v_stock_quantity + v_item.quantity),
              true
            ),
            updated_at = now()
        where id = v_item.shirt_id;
      end if;
    end loop;
  end if;

  update public.shirt_orders
  set status = p_status::public.order_status,
      updated_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    'shirt_order_reviewed',
    'shirt_order',
    p_order_id::text,
    'Status do pedido de camisas alterado.',
    jsonb_build_object('from', v_order.status::text, 'to', p_status)
  );
end;
$$;


ALTER FUNCTION "public"."forjados_review_shirt_order_v1"("p_order_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_save_active_edition_v2"("p_title" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_location" "text", "p_registration_amount" numeric, "p_registration_open" boolean, "p_create_new" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    raise exception 'Nome e inÃ­cio sÃ£o obrigatÃ³rios.' using errcode = '22023';
  end if;
  if p_ends_at is not null and p_ends_at < p_starts_at then
    raise exception 'A data final nÃ£o pode ser anterior ao inÃ­cio.' using errcode = '22023';
  end if;
  if p_registration_amount is null or p_registration_amount < 0 then
    raise exception 'Valor de inscriÃ§Ã£o invÃ¡lido.' using errcode = '22023';
  end if;

  select * into v_current
  from public.forjados_editions
  where is_active = true
  order by starts_at asc
  limit 1
  for update;

  if coalesce(p_create_new, false) and v_current.id is not null then
    if p_starts_at <= v_current.starts_at then
      raise exception 'A prÃ³xima ediÃ§Ã£o precisa comeÃ§ar depois da ediÃ§Ã£o atual.' using errcode = '22023';
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
      then 'Nova ediÃ§Ã£o criada; histÃ³rico e pagamentos da ediÃ§Ã£o anterior foram preservados.'
      else 'ConfiguraÃ§Ã£o da ediÃ§Ã£o ativa atualizada.'
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


ALTER FUNCTION "public"."forjados_save_active_edition_v2"("p_title" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_location" "text", "p_registration_amount" numeric, "p_registration_open" boolean, "p_create_new" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_save_event_route_v1"("p_edition_id" "uuid", "p_start_at" timestamp with time zone, "p_rows" "jsonb", "p_is_published" boolean DEFAULT false, "p_replace" boolean DEFAULT true) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_cursor timestamptz := p_start_at;
  v_row jsonb;
  v_title text;
  v_duration integer;
  v_location_id uuid;
  v_location_name text;
  v_activity_type text;
  v_order integer := 0;
begin
  if not (select private.forjados_has_any_role_v1(array['admin', 'director'])) then
    raise exception 'Apenas Admin e Diretoria podem montar o roteiro.' using errcode = '42501';
  end if;
  if p_edition_id is null or p_start_at is null then
    raise exception 'EdiÃ§Ã£o e horÃ¡rio inicial sÃ£o obrigatÃ³rios.';
  end if;
  if not exists (select 1 from public.forjados_editions where id = p_edition_id) then
    raise exception 'EdiÃ§Ã£o nÃ£o encontrada.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0
     or jsonb_array_length(p_rows) > 100 then
    raise exception 'O roteiro precisa ter entre 1 e 100 etapas.';
  end if;

  if p_replace then
    update public.event_schedule_items
    set deleted_at = now(), is_published = false, updated_at = now()
    where edition_id = p_edition_id
      and schedule_kind = 'route'
      and deleted_at is null;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_order := v_order + 1;
    v_title := left(trim(coalesce(v_row ->> 'title', '')), 160);
    v_duration := coalesce((v_row ->> 'duration_minutes')::integer, 0);
    v_location_id := nullif(v_row ->> 'location_id', '')::uuid;
    v_activity_type := coalesce(nullif(v_row ->> 'activity_type', ''), 'activity');
    if char_length(v_title) < 3 then raise exception 'A etapa % precisa de um nome.', v_order; end if;
    if v_duration < 1 or v_duration > 1440 then raise exception 'DuraÃ§Ã£o invÃ¡lida na etapa %.', v_order; end if;
    if v_activity_type not in ('activity', 'worship', 'meal', 'service', 'transport', 'break', 'other') then
      v_activity_type := 'activity';
    end if;

    v_location_name := '';
    if v_location_id is not null then
      select unit.name into v_location_name
      from public.event_service_units unit
      where unit.id = v_location_id
        and unit.edition_id = p_edition_id
        and unit.unit_type = 'location';
      if v_location_name is null then raise exception 'Local invÃ¡lido na etapa %.', v_order; end if;
    end if;

    insert into public.event_schedule_items (
      edition_id, title, description, starts_at, ends_at, location, activity_type,
      team_names, responsible, responsible_id, is_published, created_by,
      schedule_kind, duration_minutes, route_order, service_unit_id
    ) values (
      p_edition_id, v_title, left(trim(coalesce(v_row ->> 'description', '')), 2000),
      v_cursor, v_cursor + make_interval(mins => v_duration), coalesce(v_location_name, ''),
      v_activity_type, '{}'::text[], '', null, coalesce(p_is_published, false), v_actor_id,
      'route', v_duration, v_order, v_location_id
    );
    v_cursor := v_cursor + make_interval(mins => v_duration);
  end loop;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, description, metadata)
  values (
    v_actor_id, 'event_route.saved', 'forjados_edition', p_edition_id::text,
    format('Roteiro do evento salvo com %s etapas.', v_order),
    jsonb_build_object('rows', v_order, 'starts_at', p_start_at, 'ends_at', v_cursor, 'published', p_is_published)
  );
  return v_order;
end;
$$;


ALTER FUNCTION "public"."forjados_save_event_route_v1"("p_edition_id" "uuid", "p_start_at" timestamp with time zone, "p_rows" "jsonb", "p_is_published" boolean, "p_replace" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_save_service_scale_v1"("p_config" "jsonb", "p_assignments" "jsonb") RETURNS "public"."service_scale_schedules"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    raise exception 'ConfiguraÃ§Ã£o da escala invÃ¡lida.' using errcode = '22023';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array'
    or jsonb_array_length(p_assignments) = 0 then
    raise exception 'A escala precisa ter pelo menos uma alocaÃ§Ã£o.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_assignments) as item(value)
    where jsonb_typeof(item.value) <> 'object'
  ) then
    raise exception 'As alocaÃ§Ãµes da escala estÃ£o invÃ¡lidas.' using errcode = '22023';
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
    raise exception 'Datas ou nÃºmeros da configuraÃ§Ã£o sÃ£o invÃ¡lidos.' using errcode = '22023';
  end;

  if v_title is null or v_start_at is null or v_end_at is null then
    raise exception 'Nome, inÃ­cio e fim da escala sÃ£o obrigatÃ³rios.' using errcode = '22023';
  end if;
  if v_end_at <= v_start_at then
    raise exception 'A data final precisa ser maior que a inicial.' using errcode = '22023';
  end if;
  if v_shift_minutes < 15 or v_shift_minutes > 720 then
    raise exception 'A duraÃ§Ã£o do serviÃ§o deve ficar entre 15 minutos e 12 horas.' using errcode = '22023';
  end if;
  if v_men_per_shift < 0 or v_women_per_shift < 0
    or v_men_per_shift + v_women_per_shift < 1 then
    raise exception 'A quantidade de pessoas por turno Ã© invÃ¡lida.' using errcode = '22023';
  end if;
  if v_min_rest_minutes < 0 or v_min_rest_minutes > 1440 then
    raise exception 'O descanso mÃ­nimo deve ficar entre 0 e 1.440 minutos.' using errcode = '22023';
  end if;
  if v_status not in ('draft', 'published') then
    raise exception 'Status da escala invÃ¡lido.' using errcode = '22023';
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
    raise exception 'HÃ¡ uma alocaÃ§Ã£o com dados incompatÃ­veis com a escala.' using errcode = '22023';
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
    raise exception 'Uma pessoa nÃ£o pode aparecer duas vezes no mesmo turno.' using errcode = '22023';
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
    raise exception 'A duraÃ§Ã£o de um turno excede a configuraÃ§Ã£o informada.' using errcode = '22023';
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
    raise exception 'A escala contÃ©m uma pessoa inexistente, inativa, em trilha ou sem alojamento compatÃ­vel.' using errcode = '22023';
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
    'Escala de serviÃ§o criada apÃ³s validaÃ§Ã£o de todos os turnos.',
    jsonb_build_object(
      'slot_count', v_slot_count,
      'assignment_count', jsonb_array_length(p_assignments),
      'status', v_status
    )
  );

  return v_schedule;
end;
$$;


ALTER FUNCTION "public"."forjados_save_service_scale_v1"("p_config" "jsonb", "p_assignments" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_save_service_scale_v2"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") RETURNS "public"."service_scale_schedules"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    raise exception 'ConfiguraÃ§Ã£o da escala invÃ¡lida.' using errcode = '22023';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array'
    or jsonb_array_length(p_slots) = 0 then
    raise exception 'Informe pelo menos uma faixa horÃ¡ria com pessoas no alojamento.' using errcode = '22023';
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
    raise exception 'Turnos ou alocaÃ§Ãµes estÃ£o em formato invÃ¡lido.' using errcode = '22023';
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
    raise exception 'Datas ou nÃºmeros da configuraÃ§Ã£o sÃ£o invÃ¡lidos.' using errcode = '22023';
  end;

  if v_title is null or v_start_at is null or v_end_at is null then
    raise exception 'Nome, inÃ­cio e fim da escala sÃ£o obrigatÃ³rios.' using errcode = '22023';
  end if;
  if v_end_at <= v_start_at then
    raise exception 'A data final precisa ser maior que a inicial.' using errcode = '22023';
  end if;
  if v_shift_minutes is null or v_shift_minutes < 15 or v_shift_minutes > 720 then
    raise exception 'A duraÃ§Ã£o do serviÃ§o deve ficar entre 15 minutos e 12 horas.' using errcode = '22023';
  end if;
  if v_min_rest_minutes is null or v_min_rest_minutes < 0 or v_min_rest_minutes > 1440 then
    raise exception 'O descanso mÃ­nimo deve ficar entre 0 e 1.440 minutos.' using errcode = '22023';
  end if;
  if v_status not in ('draft', 'published') then
    raise exception 'Status da escala invÃ¡lido.' using errcode = '22023';
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
    raise exception 'A escala excede o limite de 1.000 faixas horÃ¡rias.' using errcode = '22023';
  end if;
  if v_min_slot is distinct from 1 or v_max_slot is distinct from v_slot_count
    or (select count(distinct slot.slot_number) from jsonb_to_recordset(p_slots) as slot(slot_number integer)) <> v_slot_count then
    raise exception 'As faixas horÃ¡rias precisam estar numeradas em sequÃªncia, sem repetiÃ§Ã£o.' using errcode = '22023';
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
    raise exception 'HÃ¡ uma faixa horÃ¡ria com data ou quantidade invÃ¡lida.' using errcode = '22023';
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
    raise exception 'As faixas horÃ¡rias nÃ£o podem se sobrepor.' using errcode = '22023';
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
    raise exception 'HÃ¡ uma alocaÃ§Ã£o incompatÃ­vel com as faixas horÃ¡rias.' using errcode = '22023';
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
    raise exception 'Uma pessoa nÃ£o pode aparecer duas vezes na mesma faixa horÃ¡ria.' using errcode = '22023';
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
    raise exception 'Cada faixa horÃ¡ria precisa ter exatamente a quantidade de pessoas configurada.' using errcode = '22023';
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
    raise exception 'A escala contÃ©m pessoa inexistente, inativa, em trilha ou sem alojamento compatÃ­vel.' using errcode = '22023';
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
          || 'â€“'
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
        'VocÃª estÃ¡ na escala de alojamento',
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
    'Escala variÃ¡vel criada apÃ³s validaÃ§Ã£o de todas as faixas horÃ¡rias.',
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


ALTER FUNCTION "public"."forjados_save_service_scale_v2"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_save_service_scale_v3"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") RETURNS "public"."service_scale_schedules"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.forjados_save_service_scale_v3(p_config, p_slots, p_assignments);
$$;


ALTER FUNCTION "public"."forjados_save_service_scale_v3"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."forjados_save_service_scale_v3"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") IS 'Wrapper SECURITY INVOKER para a implementaÃ§Ã£o validada no schema privado.';



CREATE OR REPLACE FUNCTION "public"."forjados_scrub_account_references_v1"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
declare
  v_record record;
begin
  if p_user_id is null then
    raise exception 'UsuÃ¡rio invÃ¡lido.';
  end if;

  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'OperaÃ§Ã£o restrita ao serviÃ§o de exclusÃ£o.';
  end if;

  delete from public.app_notifications where user_id = p_user_id;

  update public.audit_logs
  set actor_id = null,
      actor_name = case when actor_id = p_user_id then 'Conta excluÃ­da' else actor_name end,
      actor_email = case when actor_id = p_user_id then null else actor_email end,
      entity_id = case when entity_id = p_user_id::text then null else entity_id end,
      description = case
        when actor_id = p_user_id or entity_id = p_user_id::text
          then 'Registro operacional preservado sem identificaÃ§Ã£o pessoal.'
        else description
      end,
      metadata = case
        when actor_id = p_user_id
          or entity_id = p_user_id::text
          or metadata::text like '%' || p_user_id::text || '%'
          then jsonb_build_object('personal_data_removed', true)
        else metadata
      end
  where actor_id = p_user_id
     or entity_id = p_user_id::text
     or metadata::text like '%' || p_user_id::text || '%';

  update public.chats
  set participants = array_remove(participants, p_user_id),
      participant_roles = participant_roles - p_user_id::text,
      updated_at = now()
  where p_user_id = any(participants);

  delete from public.chats where cardinality(participants) = 0;

  for v_record in
    select column_row.table_name, column_row.column_name
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.data_type = 'uuid'
      and column_row.is_nullable = 'YES'
      and column_row.column_name in (
        'created_by', 'updated_by', 'reviewed_by', 'confirmed_by',
        'performed_by', 'deleted_by', 'granted_by', 'delivered_by'
      )
  loop
    execute format(
      'update public.%I set %I = null where %I = $1',
      v_record.table_name,
      v_record.column_name,
      v_record.column_name
    ) using p_user_id;
  end loop;
end;
$_$;


ALTER FUNCTION "public"."forjados_scrub_account_references_v1"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_send_test_push_notification"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_notification_id uuid;
begin
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.web_push_subscriptions subscription
    where subscription.user_id = v_user_id
      and subscription.is_active = true
  ) then
    raise exception 'Ative as notificaÃ§Ãµes neste aparelho antes de enviar o teste.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.app_notifications notification
    where notification.user_id = v_user_id
      and notification.type = 'push_test'
      and notification.created_at > now() - interval '30 seconds'
  ) then
    raise exception 'Aguarde 30 segundos antes de enviar outro teste.'
      using errcode = '22023';
  end if;

  insert into public.app_notifications (user_id, title, message, type)
  values (
    v_user_id,
    'NotificaÃ§Ãµes FORJADOS ativas',
    'Tudo certo! Este aparelho estÃ¡ preparado para receber avisos importantes.',
    'push_test'
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;


ALTER FUNCTION "public"."forjados_send_test_push_notification"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."edition_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(12,2) DEFAULT 80 NOT NULL,
    "enrollment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "will_participate" boolean,
    "participation_responded_at" timestamp with time zone,
    CONSTRAINT "edition_enrollments_enrollment_status_check" CHECK (("enrollment_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'exempt'::"text"]))),
    CONSTRAINT "edition_enrollments_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'exempt'::"text"])))
);


ALTER TABLE "public"."edition_enrollments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_set_active_edition_participation_v1"("p_will_participate" boolean) RETURNS "public"."edition_enrollments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_edition public.forjados_editions%rowtype;
  v_enrollment public.edition_enrollments%rowtype;
begin
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '42501';
  end if;
  if p_will_participate is null then
    raise exception 'Informe se participarÃ¡ da prÃ³xima ediÃ§Ã£o.' using errcode = '22023';
  end if;

  select * into v_edition
  from public.forjados_editions
  where is_active = true
  order by starts_at asc
  limit 1
  for update;

  if v_edition.id is null then
    raise exception 'NÃ£o existe uma ediÃ§Ã£o ativa.' using errcode = '22023';
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
    raise exception 'JÃ¡ existe pagamento ou comprovante em anÃ¡lise para esta ediÃ§Ã£o. Procure a administraÃ§Ã£o para alterar sua participaÃ§Ã£o.' using errcode = '22023';
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
    'Participante respondeu se irÃ¡ Ã  ediÃ§Ã£o ativa.',
    jsonb_build_object('edition_id', v_edition.id, 'will_participate', p_will_participate)
  );

  return v_enrollment;
end;
$$;


ALTER FUNCTION "public"."forjados_set_active_edition_participation_v1"("p_will_participate" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."honor_goals" (
    "user_id" "uuid" NOT NULL,
    "goal_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "target_points" integer NOT NULL,
    "product_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "honor_goals_goal_type_check" CHECK (("goal_type" = ANY (ARRAY['custom'::"text", 'product'::"text"]))),
    CONSTRAINT "honor_goals_target_points_check" CHECK ((("target_points" >= 1) AND ("target_points" <= 1000000))),
    CONSTRAINT "honor_goals_title_check" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 3) AND ("char_length"(TRIM(BOTH FROM "title")) <= 80)))
);


ALTER TABLE "public"."honor_goals" OWNER TO "postgres";


COMMENT ON TABLE "public"."honor_goals" IS 'Meta pessoal de pontos de honra. Cada usuÃ¡rio mantÃ©m uma meta ativa por vez.';



CREATE OR REPLACE FUNCTION "public"."forjados_set_my_honor_goal_v1"("p_goal_type" "text", "p_title" "text" DEFAULT NULL::"text", "p_target_points" integer DEFAULT NULL::integer, "p_product_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."honor_goals"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_goal public.honor_goals;
  v_title text;
  v_target_points integer;
  v_product_id uuid;
  v_actor_name text;
  v_actor_email text;
begin
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '42501';
  end if;

  if p_goal_type not in ('custom', 'product') then
    raise exception 'Tipo de meta invÃ¡lido.';
  end if;

  if p_goal_type = 'product' then
    if p_product_id is null then
      raise exception 'Escolha um item da Loja de Honra.';
    end if;

    select product.id, trim(product.name), product.points_cost
      into v_product_id, v_title, v_target_points
    from public.points_store_products product
    where product.id = p_product_id
      and product.is_active = true
      and product.stock > 0
      and product.deleted_at is null;

    if not found then
      raise exception 'Este item nÃ£o estÃ¡ disponÃ­vel para ser usado como meta.';
    end if;

    if v_target_points < 1 then
      raise exception 'Este item ainda nÃ£o possui um valor de honra vÃ¡lido.';
    end if;
  else
    v_title := trim(coalesce(p_title, ''));
    v_target_points := p_target_points;
    v_product_id := null;

    if char_length(v_title) < 3 or char_length(v_title) > 80 then
      raise exception 'DÃª um nome de 3 a 80 caracteres para sua meta.';
    end if;

    if v_target_points is null or v_target_points < 1 or v_target_points > 1000000 then
      raise exception 'A meta deve ter entre 1 e 1.000.000 de pontos.';
    end if;
  end if;

  insert into public.honor_goals (
    user_id,
    goal_type,
    title,
    target_points,
    product_id,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    p_goal_type,
    v_title,
    v_target_points,
    v_product_id,
    now(),
    now()
  )
  on conflict (user_id) do update
    set goal_type = excluded.goal_type,
        title = excluded.title,
        target_points = excluded.target_points,
        product_id = excluded.product_id,
        updated_at = now()
  returning * into v_goal;

  select profile.display_name, profile.email
    into v_actor_name, v_actor_email
  from public.profiles profile
  where profile.id = v_user_id;

  insert into public.audit_logs (
    actor_id,
    actor_name,
    actor_email,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  ) values (
    v_user_id,
    v_actor_name,
    v_actor_email,
    'honor_goal.saved',
    'honor_goal',
    v_user_id::text,
    'Meta pessoal de honra atualizada.',
    jsonb_build_object(
      'goal_type', v_goal.goal_type,
      'target_points', v_goal.target_points,
      'product_id', v_goal.product_id
    )
  );

  return v_goal;
end;
$$;


ALTER FUNCTION "public"."forjados_set_my_honor_goal_v1"("p_goal_type" "text", "p_title" "text", "p_target_points" integer, "p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_start_trail_route_v1"("p_group_id" "uuid", "p_now" timestamp with time zone DEFAULT "clock_timestamp"()) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_plan public.trail_route_plans%rowtype;
  v_execution public.trail_route_executions%rowtype;
  v_first public.trail_route_execution_steps%rowtype;
  v_last public.trail_route_execution_steps%rowtype;
  v_station public.trail_map_stations%rowtype;
  v_variance integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));

  select * into v_plan
  from public.trail_route_plans
  where group_id = p_group_id;
  if not found then
    raise exception 'Cadastre a rota ideal deste grupo antes de iniciar.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.trail_route_plan_steps where plan_id = v_plan.id) then
    raise exception 'A rota ideal deste grupo ainda nao possui etapas.' using errcode = '22023';
  end if;

  select * into v_execution
  from public.trail_route_executions
  where edition_id = v_plan.edition_id and group_id = p_group_id
  for update;

  if found then
    if v_execution.run_status = 'active' then return v_execution.id; end if;
    raise exception 'A trilha deste grupo ja foi encerrada.' using errcode = '22023';
  end if;

  insert into public.trail_route_executions (
    edition_id, group_id, plan_id, run_status, started_at
  ) values (
    v_plan.edition_id, p_group_id, v_plan.id, 'active', p_now
  ) returning * into v_execution;

  insert into public.trail_route_execution_steps (
    execution_id, edition_id, group_id, plan_step_id, station_id, label,
    original_order, live_order, stay_minutes, travel_minutes,
    planned_arrival_at, eta_at, step_status, is_break
  )
  select
    v_execution.id,
    v_plan.edition_id,
    p_group_id,
    step.id,
    step.station_id,
    step.label,
    row_number() over (order by step.ideal_order)::integer,
    row_number() over (order by step.ideal_order)::integer,
    step.stay_minutes,
    step.travel_minutes,
    v_plan.starts_at + make_interval(mins => coalesce(
      sum(step.stay_minutes + step.travel_minutes) over (
        order by step.ideal_order rows between unbounded preceding and 1 preceding
      ), 0
    )::integer),
    p_now + make_interval(mins => coalesce(
      sum(step.stay_minutes + step.travel_minutes) over (
        order by step.ideal_order rows between unbounded preceding and 1 preceding
      ), 0
    )::integer),
    case when row_number() over (order by step.ideal_order) = 1 then 'current' else 'pending' end,
    step.is_break
  from public.trail_route_plan_steps step
  where step.plan_id = v_plan.id
  order by step.ideal_order;

  select * into v_first
  from public.trail_route_execution_steps
  where execution_id = v_execution.id
  order by live_order
  limit 1;

  update public.trail_route_execution_steps
  set checked_in_at = p_now, eta_at = p_now
  where id = v_first.id;

  select * into v_last
  from public.trail_route_execution_steps
  where execution_id = v_execution.id
  order by live_order desc
  limit 1;

  v_variance := round(extract(epoch from (p_now - v_first.planned_arrival_at)) / 60.0)::integer;
  v_variance := greatest(-720, least(720, v_variance));

  update public.trail_route_executions
  set schedule_variance_minutes = v_variance,
      estimated_finish_at = v_last.eta_at + make_interval(mins => v_last.stay_minutes)
  where id = v_execution.id;

  select * into v_station from public.trail_map_stations where id = v_first.station_id;
  insert into public.trail_group_traffic (
    edition_id, group_id, station_id, origin_station_id, destination_station_id,
    marker_x, marker_y, movement_status, traffic_signal, delay_minutes, notes
  ) values (
    v_plan.edition_id, p_group_id, v_first.station_id, null, null,
    coalesce(v_station.x_percent, 50), coalesce(v_station.y_percent, 50),
    'at_station', case when v_variance > 10 then 'attention' else 'clear' end,
    greatest(0, v_variance), 'Trilha iniciada automaticamente.'
  )
  on conflict (edition_id, group_id) do update
    set station_id = excluded.station_id,
        origin_station_id = null,
        destination_station_id = null,
        marker_x = excluded.marker_x,
        marker_y = excluded.marker_y,
        movement_status = excluded.movement_status,
        traffic_signal = excluded.traffic_signal,
        delay_minutes = excluded.delay_minutes,
        notes = excluded.notes;

  return v_execution.id;
end;
$$;


ALTER FUNCTION "public"."forjados_start_trail_route_v1"("p_group_id" "uuid", "p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_submit_inscription_receipt_v1"("p_file_path" "text", "p_file_name" "text", "p_file_type" "text", "p_user_name" "text", "p_user_email" "text", "p_user_whatsapp" "text" DEFAULT ''::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if v_user_id is null then raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '42501'; end if;

  select edition.id, edition.registration_amount, edition.status
  into v_edition_id, v_amount, v_edition_status
  from public.forjados_editions edition
  where edition.is_active = true
  order by edition.starts_at asc
  limit 1;

  if v_edition_id is null then raise exception 'NÃ£o existe uma ediÃ§Ã£o ativa.'; end if;
  if v_edition_status <> 'open' then raise exception 'As inscriÃ§Ãµes desta ediÃ§Ã£o estÃ£o fechadas.'; end if;
  if not exists (
    select 1 from public.edition_enrollments enrollment
    where enrollment.edition_id = v_edition_id
      and enrollment.user_id = v_user_id
      and enrollment.will_participate is true
  ) then
    raise exception 'Confirme sua participaÃ§Ã£o nesta ediÃ§Ã£o antes de enviar o comprovante.';
  end if;
  if p_file_path is null or p_file_path not like (
    v_user_id::text || '/inscricoes/' || v_edition_id::text || '/%'
  ) then raise exception 'Caminho de comprovante invÃ¡lido.'; end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'payment-receipts' and object.name = p_file_path
  ) then raise exception 'O arquivo enviado nÃ£o foi encontrado.'; end if;
  if exists (
    select 1 from public.payment_receipts receipt
    where receipt.user_id = v_user_id
      and receipt.edition_id = v_edition_id
      and receipt.type = 'inscription'
      and receipt.status::text in ('pending', 'approved')
      and receipt.deleted_at is null
  ) then raise exception 'JÃ¡ existe um comprovante vÃ¡lido ou em anÃ¡lise para esta ediÃ§Ã£o.'; end if;

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
    'Comprovante de inscriÃ§Ã£o enviado.',
    jsonb_build_object('edition_id', v_edition_id, 'amount', v_amount)
  );

  return v_receipt_id;
end;
$$;


ALTER FUNCTION "public"."forjados_submit_inscription_receipt_v1"("p_file_path" "text", "p_file_name" "text", "p_file_type" "text", "p_user_name" "text", "p_user_email" "text", "p_user_whatsapp" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_submit_shirt_order_receipt_v1"("p_order_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_file_type" "text", "p_user_name" "text", "p_user_email" "text", "p_user_whatsapp" "text" DEFAULT ''::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_amount numeric(12,2);
  v_receipt_id uuid;
  v_user_name text;
  v_user_email text;
  v_user_whatsapp text;
begin
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;
  if p_file_path is null
    or p_file_path not like (
      v_user_id::text || '/shirt-orders/' || p_order_id::text || '/%'
    ) then
    raise exception 'Caminho de comprovante invÃ¡lido.';
  end if;
  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'payment-receipts'
      and object.name = p_file_path
  ) then
    raise exception 'O arquivo enviado nÃ£o foi encontrado.';
  end if;

  select orders.total_price
  into v_amount
  from public.shirt_orders orders
  where orders.id = p_order_id
    and orders.user_id = v_user_id
    and orders.status::text in ('waiting_payment', 'payment_rejected')
    and orders.deleted_at is null
  for update;

  if not found then
    raise exception 'Pedido nÃ£o encontrado ou indisponÃ­vel para comprovante.';
  end if;
  if exists (
    select 1
    from public.payment_receipts receipt
    where receipt.order_id = p_order_id
      and receipt.type = 'order'
      and receipt.status::text in ('pending', 'approved')
      and receipt.deleted_at is null
  ) then
    raise exception 'JÃ¡ existe um comprovante vÃ¡lido ou em anÃ¡lise para este pedido.';
  end if;

  select
    coalesce(nullif(profile.display_name, ''), nullif(p_user_name, ''), 'Participante'),
    coalesce(nullif(profile.email, ''), nullif(p_user_email, ''), auth_user.email, ''),
    coalesce(nullif(profile.phone, ''), p_user_whatsapp, '')
  into v_user_name, v_user_email, v_user_whatsapp
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = v_user_id;

  insert into public.payment_receipts (
    user_id,
    user_name,
    user_email,
    user_whatsapp,
    amount,
    file_url,
    file_path,
    file_name,
    file_type,
    status,
    type,
    order_id
  ) values (
    v_user_id,
    v_user_name,
    v_user_email,
    v_user_whatsapp,
    v_amount,
    '',
    p_file_path,
    left(coalesce(p_file_name, 'comprovante'), 255),
    left(coalesce(p_file_type, 'arquivo'), 120),
    'pending'::public.receipt_status,
    'order',
    p_order_id
  )
  returning id into v_receipt_id;

  update public.shirt_orders
  set status = 'receipt_sent'::public.order_status,
      proof_url = '',
      proof_path = p_file_path,
      updated_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'shirt_order_receipt_submitted',
    'payment_receipt',
    v_receipt_id::text,
    'Comprovante de pedido de camisas enviado.',
    jsonb_build_object('order_id', p_order_id, 'amount', v_amount)
  );

  return v_receipt_id;
end;
$$;


ALTER FUNCTION "public"."forjados_submit_shirt_order_receipt_v1"("p_order_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_file_type" "text", "p_user_name" "text", "p_user_email" "text", "p_user_whatsapp" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_sync_service_scale_profiles_v1"() RETURNS TABLE("inserted_count" integer, "updated_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  if v_actor_id is null or not (select public.can_manage_service_scale()) then
    raise exception 'Acesso negado para sincronizar a escala.' using errcode = '42501';
  end if;

  with approved_profiles as (
    select
      profile.id,
      coalesce(nullif(trim(profile.full_name), ''), nullif(trim(profile.display_name), ''), 'Membro') as person_name,
      nullif(trim(profile.phone), '') as phone,
      coalesce(profile.email, '') as email,
      profile.role::text as role,
      coalesce(profile.sectors, '{}'::text[]) as sectors,
      nullif(trim(profile.primary_team), '') as primary_team
    from public.profiles profile
    where profile.inscription_status::text = 'approved'
      and coalesce(profile.is_deleted, false) = false
  ), updated as (
    update public.service_scale_people person
    set name = approved.person_name,
        display_name = approved.person_name,
        phone = coalesce(approved.phone, person.phone),
        email = approved.email,
        role = approved.role,
        sectors = approved.sectors,
        sector = coalesce(nullif(person.sector, ''), approved.primary_team, approved.sectors[1]),
        updated_at = now()
    from approved_profiles approved
    where person.user_id = approved.id
      and (
        person.name is distinct from approved.person_name
        or person.display_name is distinct from approved.person_name
        or person.phone is distinct from coalesce(approved.phone, person.phone)
        or person.email is distinct from approved.email
        or person.role is distinct from approved.role
        or person.sectors is distinct from approved.sectors
        or person.sector is distinct from coalesce(nullif(person.sector, ''), approved.primary_team, approved.sectors[1])
      )
    returning person.id
  )
  select count(*)::integer into v_updated from updated;

  with approved_profiles as (
    select
      profile.id,
      coalesce(nullif(trim(profile.full_name), ''), nullif(trim(profile.display_name), ''), 'Membro') as person_name,
      nullif(trim(profile.phone), '') as phone,
      coalesce(profile.email, '') as email,
      profile.role::text as role,
      coalesce(profile.sectors, '{}'::text[]) as sectors,
      nullif(trim(profile.primary_team), '') as primary_team
    from public.profiles profile
    where profile.inscription_status::text = 'approved'
      and coalesce(profile.is_deleted, false) = false
  ), inserted as (
    insert into public.service_scale_people (
      user_id, name, display_name, gender, phone, sector,
      is_active, does_trail, notes, email, role, sectors
    )
    select
      approved.id, approved.person_name, approved.person_name, null,
      approved.phone, coalesce(approved.primary_team, approved.sectors[1]),
      true, false,
      'Sincronizado automaticamente do perfil aprovado. Defina o alojamento antes de gerar a escala.',
      approved.email, approved.role, approved.sectors
    from approved_profiles approved
    where not exists (
      select 1 from public.service_scale_people person where person.user_id = approved.id
    )
    on conflict (user_id) do nothing
    returning id
  )
  select count(*)::integer into v_inserted from inserted;

  if v_inserted > 0 then
    insert into public.audit_logs (
      actor_id, action, entity_type, description, metadata
    ) values (
      v_actor_id,
      'service_scale_profiles_synced',
      'service_scale_people',
      'UsuÃ¡rios aprovados foram vinculados ao mÃ³dulo de escala.',
      jsonb_build_object('inserted_count', v_inserted, 'updated_count', v_updated)
    );
  end if;

  return query select v_inserted, v_updated;
end;
$$;


ALTER FUNCTION "public"."forjados_sync_service_scale_profiles_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_toggle_my_notification_pin_v1"("p_notification_id" "uuid", "p_is_pinned" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if (select auth.uid()) is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.' using errcode = '28000';
  end if;

  update public.app_notifications notification
  set
    is_pinned = coalesce(p_is_pinned, false),
    pinned_at = case when coalesce(p_is_pinned, false) then now() else null end
  where notification.id = p_notification_id
    and notification.user_id = (select auth.uid())
    and notification.cleared_at is null;

  if not found then
    raise exception 'NotificaÃ§Ã£o nÃ£o encontrada.' using errcode = 'P0002';
  end if;
end;
$$;


ALTER FUNCTION "public"."forjados_toggle_my_notification_pin_v1"("p_notification_id" "uuid", "p_is_pinned" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_update_attendance_v1"("p_participation_id" "uuid", "p_attendance_status" "text", "p_notes" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not (select private.forjados_has_any_role_v1(array['admin'])) then
    raise exception 'Apenas Administradores podem alterar a presenÃ§a.' using errcode = '42501';
  end if;
  if p_attendance_status not in ('confirmed', 'present', 'absent', 'excused') then
    raise exception 'Status de presenÃ§a invÃ¡lido.';
  end if;
  update public.retreat_participations
  set attendance_status = p_attendance_status,
      attendance_notes = nullif(left(trim(coalesce(p_notes, '')), 1000), ''),
      attendance_updated_by = (select auth.uid()), attendance_updated_at = now()
  where id = p_participation_id;
  if not found then raise exception 'ParticipaÃ§Ã£o nÃ£o encontrada.'; end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, description, metadata)
  values ((select auth.uid()), 'attendance.updated', 'retreat_participation', p_participation_id::text,
    'Status de presenÃ§a alterado manualmente.', jsonb_build_object('status', p_attendance_status, 'notes', p_notes));
end;
$$;


ALTER FUNCTION "public"."forjados_update_attendance_v1"("p_participation_id" "uuid", "p_attendance_status" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_update_attendance_v2"("p_user_id" "uuid", "p_edition_id" "uuid", "p_attendance_status" "text", "p_notes" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_edition_title text;
  v_previous_status text := 'confirmed';
  v_participation_id uuid;
  v_notes text := nullif(left(trim(coalesce(p_notes, '')), 1000), '');
begin
  if not (select private.forjados_has_any_role_v1(array['admin'])) then
    raise exception 'Apenas Administradores podem alterar a presenÃ§a.'
      using errcode = '42501';
  end if;

  if p_user_id is null or p_edition_id is null then
    raise exception 'Participante e ediÃ§Ã£o sÃ£o obrigatÃ³rios.'
      using errcode = '22023';
  end if;

  if p_attendance_status not in ('confirmed', 'present', 'absent', 'excused') then
    raise exception 'Status de presenÃ§a invÃ¡lido.'
      using errcode = '22023';
  end if;

  select edition.title
  into v_edition_title
  from public.forjados_editions edition
  where edition.id = p_edition_id;

  if not found then
    raise exception 'EdiÃ§Ã£o nÃ£o encontrada.'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and profile.is_deleted is false
  ) then
    raise exception 'Participante nÃ£o encontrado.'
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
    raise exception 'O participante nÃ£o confirmou presenÃ§a nesta ediÃ§Ã£o.'
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
    'Status de presenÃ§a alterado manualmente.',
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


ALTER FUNCTION "public"."forjados_update_attendance_v2"("p_user_id" "uuid", "p_edition_id" "uuid", "p_attendance_status" "text", "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."forjados_update_attendance_v2"("p_user_id" "uuid", "p_edition_id" "uuid", "p_attendance_status" "text", "p_notes" "text") IS 'Registra presenÃ§a fÃ­sica manualmente, inclusive antes da confirmaÃ§Ã£o financeira.';



CREATE OR REPLACE FUNCTION "public"."forjados_update_my_profile_v1"("p_payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_requested_role public.user_role;
begin
  if v_user_id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Dados de perfil invÃ¡lidos.';
  end if;
  if p_payload ? 'display_name'
    and nullif(trim(p_payload->>'display_name'), '') is null then
    raise exception 'Nome Ã© obrigatÃ³rio.';
  end if;
  if p_payload ? 'sectors'
    and (
      jsonb_typeof(p_payload->'sectors') <> 'array'
      or jsonb_array_length(p_payload->'sectors') > 20
    ) then
    raise exception 'Setores invÃ¡lidos.';
  end if;
  if p_payload ? 'skills'
    and (
      jsonb_typeof(p_payload->'skills') <> 'array'
      or jsonb_array_length(p_payload->'skills') > 50
    ) then
    raise exception 'Habilidades invÃ¡lidas.';
  end if;
  if p_payload ? 'emergency_contact'
    and (
      jsonb_typeof(p_payload->'emergency_contact') <> 'object'
      or octet_length((p_payload->'emergency_contact')::text) > 4000
    ) then
    raise exception 'Contato de emergÃªncia invÃ¡lido.';
  end if;
  if p_payload ? 'terms_accepted'
    and (
      jsonb_typeof(p_payload->'terms_accepted') <> 'object'
      or octet_length((p_payload->'terms_accepted')::text) > 4000
    ) then
    raise exception 'Termos invÃ¡lidos.';
  end if;

  select requested_role
  into v_requested_role
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'Perfil nÃ£o encontrado.';
  end if;

  if p_payload ? 'requested_role' then
    if p_payload->>'requested_role' not in ('member', 'leader', 'director', 'treasury') then
      raise exception 'Tipo de participaÃ§Ã£o invÃ¡lido.';
    end if;
    v_requested_role := (p_payload->>'requested_role')::public.user_role;
  end if;

  update public.profiles as profile
  set display_name = case
        when p_payload ? 'display_name'
          then left(trim(p_payload->>'display_name'), 160)
        else profile.display_name
      end,
      full_name = case
        when p_payload ? 'display_name'
          then left(trim(p_payload->>'display_name'), 160)
        else profile.full_name
      end,
      phone = case
        when p_payload ? 'phone' then left(coalesce(p_payload->>'phone', ''), 40)
        else profile.phone
      end,
      birth_date = case
        when p_payload ? 'birth_date' then nullif(p_payload->>'birth_date', '')::date
        else profile.birth_date
      end,
      city = case
        when p_payload ? 'city' then left(coalesce(p_payload->>'city', ''), 120)
        else profile.city
      end,
      neighborhood = case
        when p_payload ? 'neighborhood' then left(coalesce(p_payload->>'neighborhood', ''), 120)
        else profile.neighborhood
      end,
      member_since = case
        when p_payload ? 'member_since' then nullif(p_payload->>'member_since', '')::date
        else profile.member_since
      end,
      requested_role = v_requested_role,
      primary_team = case
        when p_payload ? 'primary_team'
          then nullif(left(coalesce(p_payload->>'primary_team', ''), 120), '')
        else profile.primary_team
      end,
      sectors = case
        when p_payload ? 'sectors' then array(
          select left(value, 120)
          from jsonb_array_elements_text(p_payload->'sectors') as value
        )
        else profile.sectors
      end,
      specific_function = case
        when p_payload ? 'specific_function'
          then left(coalesce(p_payload->>'specific_function', ''), 160)
        else profile.specific_function
      end,
      experience_level = case
        when p_payload ? 'experience_level'
          then left(coalesce(p_payload->>'experience_level', ''), 80)
        else profile.experience_level
      end,
      shirt_size = case
        when p_payload ? 'shirt_size'
          then left(coalesce(p_payload->>'shirt_size', ''), 20)
        else profile.shirt_size
      end,
      has_vehicle = case
        when p_payload ? 'has_vehicle'
          then coalesce((p_payload->>'has_vehicle')::boolean, false)
        else profile.has_vehicle
      end,
      skills = case
        when p_payload ? 'skills' then array(
          select left(value, 120)
          from jsonb_array_elements_text(p_payload->'skills') as value
        )
        else profile.skills
      end,
      food_restrictions = case
        when p_payload ? 'food_restrictions'
          then left(coalesce(p_payload->>'food_restrictions', ''), 2000)
        else profile.food_restrictions
      end,
      health_problems = case
        when p_payload ? 'health_problems'
          then left(coalesce(p_payload->>'health_problems', ''), 2000)
        else profile.health_problems
      end,
      continuous_medicine = case
        when p_payload ? 'continuous_medicine'
          then left(coalesce(p_payload->>'continuous_medicine', ''), 2000)
        else profile.continuous_medicine
      end,
      emergency_contact = case
        when p_payload ? 'emergency_contact'
          then coalesce(p_payload->'emergency_contact', '{}'::jsonb)
        else profile.emergency_contact
      end,
      terms_accepted = case
        when p_payload ? 'terms_accepted'
          then coalesce(p_payload->'terms_accepted', '{}'::jsonb)
        else profile.terms_accepted
      end,
      updated_at = now()
  where profile.id = v_user_id;
end;
$$;


ALTER FUNCTION "public"."forjados_update_my_profile_v1"("p_payload" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_settings" (
    "singleton" boolean DEFAULT true NOT NULL,
    "points_mode" "text" DEFAULT 'per_passenger'::"text" NOT NULL,
    "points_per_passenger" integer DEFAULT 50 NOT NULL,
    "fixed_points" integer DEFAULT 100 NOT NULL,
    "event_address" "text" DEFAULT ''::"text" NOT NULL,
    "event_map_url" "text" DEFAULT ''::"text" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ride_settings_event_address_check" CHECK (("char_length"("event_address") <= 500)),
    CONSTRAINT "ride_settings_event_map_url_check" CHECK (("char_length"("event_map_url") <= 1000)),
    CONSTRAINT "ride_settings_fixed_points_check" CHECK ((("fixed_points" >= 0) AND ("fixed_points" <= 100000))),
    CONSTRAINT "ride_settings_points_mode_check" CHECK (("points_mode" = ANY (ARRAY['per_passenger'::"text", 'fixed'::"text"]))),
    CONSTRAINT "ride_settings_points_per_passenger_check" CHECK ((("points_per_passenger" >= 0) AND ("points_per_passenger" <= 100000))),
    CONSTRAINT "ride_settings_singleton_check" CHECK ("singleton")
);


ALTER TABLE "public"."ride_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."ride_settings" IS 'ConfiguraÃ§Ã£o singleton da pontuaÃ§Ã£o e do destino oficial das caronas.';



CREATE OR REPLACE FUNCTION "public"."forjados_update_ride_settings_v1"("p_points_mode" "text", "p_points_per_passenger" integer, "p_fixed_points" integer, "p_event_address" "text", "p_event_map_url" "text" DEFAULT ''::"text") RETURNS "public"."ride_settings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_result public.ride_settings;
begin
  if not (select private.forjados_has_any_role_v1(array['admin'])) then
    raise exception 'Apenas Administradores podem alterar a configuraÃ§Ã£o de caronas.' using errcode = '42501';
  end if;
  if p_points_mode not in ('per_passenger', 'fixed') then
    raise exception 'Regra de pontuaÃ§Ã£o invÃ¡lida.';
  end if;
  if coalesce(p_points_per_passenger, -1) not between 0 and 100000
    or coalesce(p_fixed_points, -1) not between 0 and 100000 then
    raise exception 'PontuaÃ§Ã£o invÃ¡lida.';
  end if;

  update public.ride_settings
  set points_mode = p_points_mode,
      points_per_passenger = p_points_per_passenger,
      fixed_points = p_fixed_points,
      event_address = left(trim(coalesce(p_event_address, '')), 500),
      event_map_url = left(trim(coalesce(p_event_map_url, '')), 1000),
      updated_by = (select auth.uid()), updated_at = now()
  where singleton is true
  returning * into v_result;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, description, metadata)
  values ((select auth.uid()), 'ride.settings_updated', 'ride_settings', 'singleton',
    'ConfiguraÃ§Ã£o de caronas atualizada.', to_jsonb(v_result));
  return v_result;
end;
$$;


ALTER FUNCTION "public"."forjados_update_ride_settings_v1"("p_points_mode" "text", "p_points_per_passenger" integer, "p_fixed_points" integer, "p_event_address" "text", "p_event_map_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forjados_upsert_active_edition_v1"("p_title" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_location" "text", "p_registration_amount" numeric, "p_registration_open" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_edition_id uuid;
begin
  if not private.forjados_has_any_role_v1(array['admin', 'director']) then
    raise exception 'Acesso negado.';
  end if;
  if nullif(trim(p_title), '') is null or p_starts_at is null then
    raise exception 'Nome e inÃ­cio sÃ£o obrigatÃ³rios.';
  end if;
  if p_ends_at is not null and p_ends_at < p_starts_at then
    raise exception 'A data final nÃ£o pode ser anterior ao inÃ­cio.';
  end if;
  if p_registration_amount is null or p_registration_amount < 0 then
    raise exception 'Valor de inscriÃ§Ã£o invÃ¡lido.';
  end if;

  select id
  into v_edition_id
  from public.forjados_editions
  where is_active = true
  order by starts_at asc
  limit 1
  for update;

  if v_edition_id is null then
    insert into public.forjados_editions (
      title,
      starts_at,
      ends_at,
      registration_amount,
      status,
      is_active,
      location,
      created_by
    ) values (
      left(trim(p_title), 160),
      p_starts_at,
      p_ends_at,
      round(p_registration_amount, 2),
      case when coalesce(p_registration_open, false) then 'open' else 'closed' end,
      true,
      left(coalesce(p_location, ''), 255),
      v_actor_id
    )
    returning id into v_edition_id;
  else
    update public.forjados_editions
    set title = left(trim(p_title), 160),
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        registration_amount = round(p_registration_amount, 2),
        status = case
          when coalesce(p_registration_open, false) then 'open'
          else 'closed'
        end,
        location = left(coalesce(p_location, ''), 255),
        updated_at = now()
    where id = v_edition_id;

    update public.edition_enrollments
    set amount = round(p_registration_amount, 2),
        updated_at = now()
    where edition_id = v_edition_id
      and payment_status in ('pending', 'rejected');
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, description, metadata
  ) values (
    v_actor_id,
    'active_edition_updated',
    'forjados_edition',
    v_edition_id::text,
    'ConfiguraÃ§Ã£o da ediÃ§Ã£o ativa atualizada.',
    jsonb_build_object(
      'registration_amount', round(p_registration_amount, 2),
      'registration_open', coalesce(p_registration_open, false)
    )
  );

  return v_edition_id;
end;
$$;


ALTER FUNCTION "public"."forjados_upsert_active_edition_v1"("p_title" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_location" "text", "p_registration_amount" numeric, "p_registration_open" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_actor_email"("p_actor" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select email from public.profiles where id = p_actor), '');
$$;


ALTER FUNCTION "public"."get_actor_email"("p_actor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_actor_name"("p_actor" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select display_name from public.profiles where id = p_actor),
    (select email from public.profiles where id = p_actor),
    'Sistema'
  );
$$;


ALTER FUNCTION "public"."get_actor_name"("p_actor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_active_edition_enrollment"() RETURNS TABLE("edition_id" "uuid", "edition_title" "text", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone, "amount" numeric, "enrollment_id" "uuid", "enrollment_status" "text", "payment_status" "text", "paid_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if (select auth.uid()) is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;

  return query
  select
    edition.id,
    edition.title,
    edition.starts_at,
    edition.ends_at,
    edition.registration_amount,
    enrollment.id,
    coalesce(enrollment.enrollment_status, 'not_created')::text,
    coalesce(enrollment.payment_status, 'not_sent')::text,
    enrollment.paid_at
  from public.forjados_editions edition
  left join public.edition_enrollments enrollment
    on enrollment.edition_id = edition.id
   and enrollment.user_id = (select auth.uid())
  where edition.is_active = true
  order by edition.starts_at asc
  limit 1;
end;
$$;


ALTER FUNCTION "public"."get_my_active_edition_enrollment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_points_manual"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_viewer public.profiles;
  v_target public.profiles;
  v_can_grant boolean := false;
begin
  select * into v_viewer from public.profiles where id = auth.uid();
  select * into v_target from public.profiles where id = p_user_id;

  if v_viewer.id is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;

  if v_target.id is null then
    raise exception 'Membro nÃ£o encontrado.';
  end if;

  v_can_grant :=
    v_viewer.is_admin = true
    or v_viewer.role::text in ('admin', 'director')
    or (
      v_viewer.role::text = 'leader'
      and v_target.inscription_status = 'approved'
      and (
        (v_viewer.primary_team is not null and v_target.primary_team = v_viewer.primary_team)
        or coalesce(v_viewer.sectors, '{}') && coalesce(v_target.sectors, '{}')
      )
    );

  if not v_can_grant then
    raise exception 'VocÃª nÃ£o tem permissÃ£o para lanÃ§ar pontos para este membro.';
  end if;

  insert into public.point_transactions (
    user_id,
    member_id,
    amount,
    reason,
    granted_by,
    granted_by_name,
    source_type
  ) values (
    p_user_id,
    v_target.member_id,
    p_amount,
    coalesce(nullif(trim(p_reason), ''), 'LanÃ§amento manual'),
    auth.uid(),
    v_viewer.display_name,
    'manual'
  );

  update public.profiles
  set points = coalesce(points, 0) + p_amount,
      updated_at = now()
  where id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."grant_points_manual"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    full_name,
    role,
    requested_role,
    inscription_status,
    is_admin,
    member_id,
    sectors,
    points
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when new.email = 'forjados.ofc@gmail.com' then 'admin'::public.user_role else 'member'::public.user_role end,
    case when new.email = 'forjados.ofc@gmail.com' then 'admin'::public.user_role else coalesce((new.raw_user_meta_data->>'requested_role')::public.user_role, 'member'::public.user_role) end,
    case when new.email = 'forjados.ofc@gmail.com' then 'approved'::public.inscription_status else 'pending'::public.inscription_status end,
    case when new.email = 'forjados.ofc@gmail.com' then true else false end,
    case when new.email = 'forjados.ofc@gmail.com' then 'ADM-0001' else 'EQP-' || upper(substr(replace(new.id::text, '-', ''), 1, 6)) end,
    case when new.email = 'forjados.ofc@gmail.com' then array['LideranÃ§a'] else '{}'::text[] end,
    0
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_payment_receipt_review_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status is distinct from new.status and new.status in ('approved', 'rejected') then
    perform public.create_notification(
      new.user_id,
      case when new.status = 'approved' then 'Pagamento aprovado' else 'Pagamento recusado' end,
      case when new.status = 'approved'
        then 'Seu comprovante foi aprovado pela equipe.'
        else concat('Seu comprovante foi recusado.', case when coalesce(new.observations, '') <> '' then concat(' ObservaÃ§Ã£o: ', new.observations) else '' end)
      end,
      'payment'
    );

    insert into public.audit_logs (
      actor_id,
      actor_name,
      actor_email,
      action,
      entity_type,
      entity_id,
      description,
      metadata
    )
    values (
      new.reviewed_by,
      public.get_actor_name(new.reviewed_by),
      public.get_actor_email(new.reviewed_by),
      'payment_reviewed',
      'payment_receipts',
      new.id::text,
      concat('Comprovante marcado como ', new.status, '.'),
      jsonb_build_object('user_id', new.user_id, 'status', new.status)
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_payment_receipt_review_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_point_transaction_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.create_notification(
    new.user_id,
    case when new.amount >= 0 then 'VocÃª recebeu pontos' else 'Seus pontos foram atualizados' end,
    concat(
      case when new.amount >= 0 then '+' else '' end,
      new.amount::text,
      ' ponto(s). Motivo: ',
      coalesce(new.reason, 'NÃ£o informado')
    ),
    'points'
  );

  insert into public.audit_logs (
    actor_id,
    actor_name,
    actor_email,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  )
  values (
    new.granted_by,
    public.get_actor_name(new.granted_by),
    public.get_actor_email(new.granted_by),
    'points_inserted',
    'point_transactions',
    new.id::text,
    concat('LanÃ§amento de ', new.amount::text, ' ponto(s).'),
    jsonb_build_object('user_id', new.user_id, 'reason', new.reason, 'amount', new.amount)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_point_transaction_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_profile_approved_for_scale"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.inscription_status = 'approved' then
    perform public.ensure_service_scale_person(new.id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_profile_approved_for_scale"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_profile_status_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if old.inscription_status is distinct from new.inscription_status then
    if new.inscription_status = 'approved' then
      perform public.create_notification(
        new.id,
        'Acesso aprovado',
        'Seu acesso ao app FORJADOS foi aprovado.',
        'access'
      );

      perform public.create_audit_log(
        'profile_approved',
        'profiles',
        new.id::text,
        concat('Perfil aprovado: ', coalesce(new.display_name, new.email, new.id::text)),
        jsonb_build_object('role', new.role, 'primary_team', new.primary_team)
      );
    elsif new.inscription_status = 'rejected' then
      perform public.create_notification(
        new.id,
        'Acesso recusado',
        'Sua solicitaÃ§Ã£o de acesso foi recusada pela equipe.',
        'access'
      );

      perform public.create_audit_log(
        'profile_rejected',
        'profiles',
        new.id::text,
        concat('Perfil recusado: ', coalesce(new.display_name, new.email, new.id::text)),
        jsonb_build_object('role', new.role, 'primary_team', new.primary_team)
      );
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_profile_status_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_public_panel_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
begin
  if new.is_active = true then
    for r in select id from public.profiles where inscription_status = 'approved'
    loop
      perform public.create_notification(
        r.id,
        'Novo aviso publicado',
        coalesce(new.title, 'Um novo aviso foi publicado no Painel PÃºblico.'),
        'public_panel'
      );
    end loop;
  end if;

  perform public.create_audit_log(
    'public_panel_created',
    'public_panel_items',
    new.id::text,
    concat('Aviso publicado: ', coalesce(new.title, 'Sem tÃ­tulo')),
    jsonb_build_object('category', new.category, 'is_pinned', new.is_pinned)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_public_panel_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (role = 'admin' or is_admin = true)
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_director_or_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('director', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_director_or_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_treasury_or_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('treasury', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_treasury_or_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_ride_atomic"("p_ride_id" "uuid", "p_passenger_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ride public.rides%rowtype;
begin
  if auth.uid() is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;

  select *
  into v_ride
  from public.rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'Carona nÃ£o encontrada.';
  end if;

  if v_ride.driver_id = auth.uid() then
    raise exception 'VocÃª nÃ£o pode entrar na sua prÃ³pria carona.';
  end if;

  if v_ride.status not in ('available', 'full') then
    raise exception 'Essa carona nÃ£o estÃ¡ disponÃ­vel.';
  end if;

  if v_ride.available_seats <= 0 then
    raise exception 'Essa carona nÃ£o possui vagas disponÃ­veis.';
  end if;

  if exists (
    select 1
    from public.ride_passengers
    where ride_id = p_ride_id
      and passenger_id = auth.uid()
  ) then
    raise exception 'VocÃª jÃ¡ estÃ¡ nessa carona.';
  end if;

  insert into public.ride_passengers (
    ride_id,
    passenger_id,
    passenger_name,
    status
  )
  values (
    p_ride_id,
    auth.uid(),
    p_passenger_name,
    'confirmed'
  );

  update public.rides
  set
    available_seats = greatest(available_seats - 1, 0),
    status = case
      when greatest(available_seats - 1, 0) = 0 then 'full'::public.ride_status
      else 'available'::public.ride_status
    end,
    updated_at = now()
  where id = p_ride_id;
end;
$$;


ALTER FUNCTION "public"."join_ride_atomic"("p_ride_id" "uuid", "p_passenger_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_ride_atomic"("p_ride_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ride public.rides%rowtype;
  v_passenger_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;

  select *
  into v_ride
  from public.rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'Carona nÃ£o encontrada.';
  end if;

  select id
  into v_passenger_id
  from public.ride_passengers
  where ride_id = p_ride_id
    and passenger_id = auth.uid();

  if v_passenger_id is null then
    raise exception 'VocÃª nÃ£o estÃ¡ nessa carona.';
  end if;

  delete from public.ride_passengers
  where id = v_passenger_id;

  update public.rides
  set
    available_seats = least(available_seats + 1, total_seats),
    status = case
      when status = 'full' then 'available'::public.ride_status
      else status
    end,
    updated_at = now()
  where id = p_ride_id;
end;
$$;


ALTER FUNCTION "public"."leave_ride_atomic"("p_ride_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_my_team_members"() RETURNS SETOF "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();

  if me.id is null then
    raise exception 'Perfil nÃ£o encontrado.' using errcode = '42501';
  end if;

  if me.role::text = 'admin' or coalesce(me.is_admin, false) = true then
    return query
    select p.* from public.profiles p
    where coalesce(p.is_deleted, false) = false
    order by p.primary_team nulls last, p.display_name;
    return;
  end if;

  if me.role::text = 'director' then
    return query
    select p.* from public.profiles p
    where coalesce(p.is_deleted, false) = false
      and p.role::text <> 'admin'
    order by p.primary_team nulls last, p.display_name;
    return;
  end if;

  if me.role::text = 'leader' then
    return query
    select p.* from public.profiles p
    where coalesce(p.is_deleted, false) = false
      and p.role::text not in ('admin', 'director')
      and p.inscription_status::text = 'approved'
      and (
        (me.primary_team is not null and p.primary_team = me.primary_team)
        or (me.primary_team is not null and p.sectors @> array[me.primary_team]::text[])
        or (p.primary_team is not null and me.sectors @> array[p.primary_team]::text[])
      )
    order by p.display_name;
    return;
  end if;

  return;
end;
$$;


ALTER FUNCTION "public"."list_my_team_members"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."points_list_eligible_profiles"() RETURNS SETOF "public"."profiles"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select member.*
  from public.profiles viewer
  join public.profiles member
    on member.email is not null
   and member.inscription_status = 'approved'
   and (
      viewer.is_admin = true
      or viewer.role::text in ('admin', 'director')
      or (
        viewer.role::text = 'leader'
        and member.id <> viewer.id
        and (
          (viewer.primary_team is not null and member.primary_team = viewer.primary_team)
          or coalesce(viewer.sectors, '{}') && coalesce(member.sectors, '{}')
        )
      )
   )
  where viewer.id = auth.uid()
  order by member.display_name asc;
$$;


ALTER FUNCTION "public"."points_list_eligible_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."points_list_ranking"() RETURNS SETOF "public"."profiles"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.*
  from public.profiles p
  where public.current_user_can_manage()
    and p.email is not null
  order by p.points desc nulls last, p.display_name asc;
$$;


ALTER FUNCTION "public"."points_list_ranking"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."point_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "member_id" "text" DEFAULT ''::"text",
    "amount" integer NOT NULL,
    "reason" "text" NOT NULL,
    "granted_by" "uuid",
    "granted_by_name" "text" DEFAULT ''::"text",
    "source_type" "text" DEFAULT 'manual'::"text",
    "source_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "delete_reason" "text"
);


ALTER TABLE "public"."point_transactions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."points_list_transactions"() RETURNS SETOF "public"."point_transactions"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."points_list_transactions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_points_product"("p_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user public.profiles%rowtype;
  v_product public.points_store_products%rowtype;
begin
  if auth.uid() is null then
    raise exception 'UsuÃ¡rio nÃ£o autenticado.';
  end if;

  select *
  into v_user
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'Perfil nÃ£o encontrado.';
  end if;

  select *
  into v_product
  from public.points_store_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Produto nÃ£o encontrado.';
  end if;

  if v_product.is_active is not true then
    raise exception 'Produto indisponÃ­vel.';
  end if;

  if v_product.stock <= 0 then
    raise exception 'Produto sem estoque.';
  end if;

  if v_user.points < v_product.points_cost then
    raise exception 'Pontos insuficientes para este resgate.';
  end if;

  update public.profiles
  set
    points = points - v_product.points_cost,
    updated_at = now()
  where id = auth.uid();

  update public.points_store_products
  set
    stock = stock - 1,
    updated_at = now()
  where id = p_product_id;

  insert into public.points_redemptions (
    user_id,
    user_name,
    user_email,
    product_id,
    product_name,
    points_cost,
    status
  )
  values (
    auth.uid(),
    coalesce(v_user.display_name, v_user.email, 'UsuÃ¡rio'),
    v_user.email,
    v_product.id,
    v_product.name,
    v_product.points_cost,
    'pending'
  );

  insert into public.point_transactions (
    user_id,
    member_id,
    amount,
    reason,
    granted_by,
    granted_by_name,
    source_type,
    source_id
  )
  values (
    auth.uid(),
    coalesce(v_user.member_id, ''),
    -v_product.points_cost,
    'Resgate na loja de pontos â€” ' || v_product.name,
    auth.uid(),
    coalesce(v_user.display_name, v_user.email),
    'redemption',
    p_product_id
  );
end;
$$;


ALTER FUNCTION "public"."redeem_points_product"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_service_scale_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_service_scale_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_deletion_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "retain_until" timestamp with time zone DEFAULT ("now"() + '5 years'::interval) NOT NULL,
    "retained_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "failure_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "account_deletion_receipts_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."account_deletion_receipts" OWNER TO "postgres";


COMMENT ON TABLE "public"."account_deletion_receipts" IS 'Comprovantes tÃ©cnicos sem identificadores diretos, mantidos temporariamente para demonstrar o atendimento de pedidos de exclusÃ£o.';



CREATE TABLE IF NOT EXISTS "public"."app_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "message" "text" DEFAULT ''::"text",
    "type" "text" DEFAULT 'info'::"text",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "pinned_at" timestamp with time zone,
    "cleared_at" timestamp with time zone,
    "receipt_archived_at" timestamp with time zone
);


ALTER TABLE "public"."app_notifications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."app_notifications"."read_at" IS 'HorÃ¡rio em que o destinatÃ¡rio confirmou a leitura da notificaÃ§Ã£o.';



COMMENT ON COLUMN "public"."app_notifications"."cleared_at" IS 'Soft archive da caixa pessoal; preserva auditoria e push.';



COMMENT ON COLUMN "public"."app_notifications"."receipt_archived_at" IS 'Soft archive da visÃ£o gerencial de confirmaÃ§Ãµes.';



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "actor_name" "text",
    "actor_email" "text",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automated_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "target" "text" DEFAULT 'all'::"text" NOT NULL,
    "target_team" "text",
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_by" "uuid",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "delete_reason" "text",
    CONSTRAINT "automated_messages_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'sent'::"text", 'cancelled'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."automated_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid",
    "message" "text" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "sender_role" "public"."user_role" DEFAULT 'member'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participants" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "participant_roles" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_message" "text" DEFAULT ''::"text",
    "last_message_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_schedule_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "location" "text" DEFAULT ''::"text" NOT NULL,
    "activity_type" "text" DEFAULT 'activity'::"text" NOT NULL,
    "team_names" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "responsible" "text" DEFAULT ''::"text" NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "responsible_id" "uuid",
    "schedule_kind" "text" DEFAULT 'activity'::"text" NOT NULL,
    "duration_minutes" integer,
    "route_order" integer,
    "service_unit_id" "uuid",
    CONSTRAINT "event_schedule_items_activity_type_check" CHECK (("activity_type" = ANY (ARRAY['activity'::"text", 'worship'::"text", 'meal'::"text", 'service'::"text", 'transport'::"text", 'break'::"text", 'other'::"text"]))),
    CONSTRAINT "event_schedule_items_description_check" CHECK (("char_length"("description") <= 2000)),
    CONSTRAINT "event_schedule_items_duration_check" CHECK ((("duration_minutes" IS NULL) OR (("duration_minutes" >= 1) AND ("duration_minutes" <= 1440)))),
    CONSTRAINT "event_schedule_items_location_check" CHECK (("char_length"("location") <= 180)),
    CONSTRAINT "event_schedule_items_responsible_check" CHECK (("char_length"("responsible") <= 180)),
    CONSTRAINT "event_schedule_items_route_order_check" CHECK ((("route_order" IS NULL) OR ("route_order" > 0))),
    CONSTRAINT "event_schedule_items_schedule_kind_check" CHECK (("schedule_kind" = ANY (ARRAY['activity'::"text", 'route'::"text"]))),
    CONSTRAINT "event_schedule_items_time_check" CHECK ((("ends_at" IS NULL) OR ("ends_at" > "starts_at"))),
    CONSTRAINT "event_schedule_items_title_check" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 3) AND ("char_length"(TRIM(BOTH FROM "title")) <= 160)))
);


ALTER TABLE "public"."event_schedule_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_schedule_items" IS 'ProgramaÃ§Ã£o oficial de cada ediÃ§Ã£o do FORJADOS, com publicaÃ§Ã£o controlada por Admin/Diretoria.';



CREATE TABLE IF NOT EXISTS "public"."event_service_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "position_id" "uuid",
    "linked_character_id" "uuid",
    "group_id" "uuid",
    "user_id" "uuid",
    "external_name" "text" DEFAULT ''::"text" NOT NULL,
    "person_name" "text" DEFAULT ''::"text" NOT NULL,
    "assignment_kind" "text" DEFAULT 'staff'::"text" NOT NULL,
    "role_title" "text" DEFAULT ''::"text" NOT NULL,
    "is_leader" boolean DEFAULT false NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_service_assignments_identity_check" CHECK (((("user_id" IS NOT NULL) AND ("external_name" = ''::"text")) OR (("user_id" IS NULL) AND (("char_length"(TRIM(BOTH FROM "external_name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "external_name")) <= 160))))),
    CONSTRAINT "event_service_assignments_kind_check" CHECK (("assignment_kind" = ANY (ARRAY['staff'::"text", 'participant'::"text"]))),
    CONSTRAINT "event_service_assignments_notes_check" CHECK (("char_length"("notes") <= 1000)),
    CONSTRAINT "event_service_assignments_role_check" CHECK (("char_length"("role_title") <= 160)),
    CONSTRAINT "event_service_assignments_time_check" CHECK ((("ends_at" IS NULL) OR (("starts_at" IS NOT NULL) AND ("ends_at" > "starts_at"))))
);


ALTER TABLE "public"."event_service_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_service_assignments" IS 'AlocaÃ§Ãµes mÃºltiplas de usuÃ¡rios do app ou participantes externos nas operaÃ§Ãµes da ediÃ§Ã£o.';



CREATE TABLE IF NOT EXISTS "public"."event_service_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "min_people" integer DEFAULT 0 NOT NULL,
    "max_people" integer,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_service_positions_description_check" CHECK (("char_length"("description") <= 1000)),
    CONSTRAINT "event_service_positions_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 160))),
    CONSTRAINT "event_service_positions_people_check" CHECK ((("min_people" >= 0) AND (("max_people" IS NULL) OR ("max_people" >= "min_people"))))
);


ALTER TABLE "public"."event_service_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_service_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "title" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_service_slots_notes_check" CHECK (("char_length"("notes") <= 1000)),
    CONSTRAINT "event_service_slots_time_check" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "event_service_slots_title_check" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 2) AND ("char_length"(TRIM(BOTH FROM "title")) <= 160)))
);


ALTER TABLE "public"."event_service_slots" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_service_slots" IS 'HorÃ¡rios de grupos, oficinas, setores e escalas operacionais.';



CREATE TABLE IF NOT EXISTS "public"."event_service_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "unit_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "color" "text" DEFAULT ''::"text" NOT NULL,
    "min_people" integer DEFAULT 0 NOT NULL,
    "max_people" integer,
    "per_group" boolean DEFAULT false NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_service_units_color_check" CHECK ((("color" = ''::"text") OR ("color" ~ '^#[0-9A-Fa-f]{6}$'::"text"))),
    CONSTRAINT "event_service_units_description_check" CHECK (("char_length"("description") <= 2000)),
    CONSTRAINT "event_service_units_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 160))),
    CONSTRAINT "event_service_units_people_check" CHECK ((("min_people" >= 0) AND (("max_people" IS NULL) OR ("max_people" >= "min_people")))),
    CONSTRAINT "event_service_units_type_check" CHECK (("unit_type" = ANY (ARRAY['character'::"text", 'sector'::"text", 'location'::"text", 'group'::"text", 'scale'::"text"])))
);


ALTER TABLE "public"."event_service_units" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_service_units" IS 'Personagens, setores, oficinas/locais, grupos e escalas configurados por ediÃ§Ã£o.';



CREATE SEQUENCE IF NOT EXISTS "public"."forjados_adm_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."forjados_adm_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forjados_editions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "registration_amount" numeric(12,2) DEFAULT 80 NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location" "text",
    CONSTRAINT "forjados_editions_registration_amount_nonnegative" CHECK (("registration_amount" >= (0)::numeric)),
    CONSTRAINT "forjados_editions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'open'::"text", 'closed'::"text", 'finished'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."forjados_editions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."forjados_eqp_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."forjados_eqp_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_runtime_secrets" (
    "secret_name" "text" NOT NULL,
    "secret_value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rotated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."internal_runtime_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."material_item_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "sector_unit_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "before_data" "jsonb",
    "after_data" "jsonb",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_by_name" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_item_history_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'updated'::"text", 'archived'::"text", 'restored'::"text"])))
);


ALTER TABLE "public"."material_item_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."material_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "sector_unit_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "item_type" "text" NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "quantity" numeric(12,2) DEFAULT 0 NOT NULL,
    "unit" "text" DEFAULT 'unidade'::"text" NOT NULL,
    "minimum_quantity" numeric(12,2) DEFAULT 0 NOT NULL,
    "location" "text" DEFAULT ''::"text" NOT NULL,
    "responsible_name" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "condition" "text" DEFAULT 'good'::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "image_path" "text",
    "is_archived" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_items_category_check" CHECK (("char_length"("category") <= 120)),
    CONSTRAINT "material_items_condition_check" CHECK (("condition" = ANY (ARRAY['new'::"text", 'good'::"text", 'fair'::"text", 'poor'::"text", 'damaged'::"text"]))),
    CONSTRAINT "material_items_location_check" CHECK (("char_length"("location") <= 180)),
    CONSTRAINT "material_items_minimum_check" CHECK (("minimum_quantity" >= (0)::numeric)),
    CONSTRAINT "material_items_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 160))),
    CONSTRAINT "material_items_notes_check" CHECK (("char_length"("notes") <= 2000)),
    CONSTRAINT "material_items_quantity_check" CHECK (("quantity" >= (0)::numeric)),
    CONSTRAINT "material_items_responsible_check" CHECK (("char_length"("responsible_name") <= 160)),
    CONSTRAINT "material_items_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'loaned'::"text", 'maintenance'::"text", 'unavailable'::"text"]))),
    CONSTRAINT "material_items_type_check" CHECK (("item_type" = ANY (ARRAY['equipment'::"text", 'consumable'::"text"]))),
    CONSTRAINT "material_items_unit_check" CHECK ((("char_length"(TRIM(BOTH FROM "unit")) >= 1) AND ("char_length"(TRIM(BOTH FROM "unit")) <= 40)))
);


ALTER TABLE "public"."material_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_name" "text" NOT NULL,
    "user_email" "text",
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "method" "text" DEFAULT 'pix'::"text" NOT NULL,
    "objective" "text" DEFAULT 'Retiro'::"text" NOT NULL,
    "notes" "text",
    "proof_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "delete_reason" "text",
    "proof_path" "text"
);


ALTER TABLE "public"."offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_name" "text" DEFAULT ''::"text" NOT NULL,
    "user_email" "text" DEFAULT ''::"text" NOT NULL,
    "user_whatsapp" "text" DEFAULT ''::"text",
    "amount" numeric(10,2) DEFAULT 80.00 NOT NULL,
    "file_url" "text" DEFAULT ''::"text",
    "file_name" "text" DEFAULT ''::"text",
    "file_type" "text" DEFAULT ''::"text",
    "status" "public"."receipt_status" DEFAULT 'pending'::"public"."receipt_status" NOT NULL,
    "type" "text" DEFAULT 'inscription'::"text" NOT NULL,
    "order_id" "uuid",
    "observations" "text" DEFAULT ''::"text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edition_id" "uuid",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "delete_reason" "text",
    "file_path" "text"
);


ALTER TABLE "public"."payment_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."points_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_name" "text" NOT NULL,
    "user_email" "text",
    "product_id" "uuid",
    "product_name" "text" NOT NULL,
    "points_cost" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "delivered_by" "uuid",
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "delete_reason" "text"
);


ALTER TABLE "public"."points_redemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."points_store_product_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "position_x" integer DEFAULT 50 NOT NULL,
    "position_y" integer DEFAULT 50 NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "points_store_product_images_position_x_check" CHECK ((("position_x" >= 0) AND ("position_x" <= 100))),
    CONSTRAINT "points_store_product_images_position_y_check" CHECK ((("position_y" >= 0) AND ("position_y" <= 100)))
);


ALTER TABLE "public"."points_store_product_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."points_store_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "points_cost" integer DEFAULT 0 NOT NULL,
    "stock" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid"
);


ALTER TABLE "public"."points_store_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "product_name" "text" NOT NULL,
    "points_cost" integer DEFAULT 0 NOT NULL,
    "status" "public"."redemption_status" DEFAULT 'requested'::"public"."redemption_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_redemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "points_value" integer DEFAULT 0 NOT NULL,
    "stock" integer DEFAULT 0 NOT NULL,
    "image_url" "text" DEFAULT ''::"text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_panel_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'aviso'::"text" NOT NULL,
    "image_url" "text" DEFAULT ''::"text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "publish_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "link_url" "text" DEFAULT ''::"text",
    "published_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "delete_reason" "text"
);


ALTER TABLE "public"."public_panel_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_notification_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "queued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_notification_queue_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."push_notification_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retreat_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT 'FORJADOS'::"text" NOT NULL,
    "start_date" timestamp with time zone NOT NULL,
    "end_date" timestamp with time zone,
    "location" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retreat_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retreat_participations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "retreat_title" "text" DEFAULT 'FORJADOS'::"text" NOT NULL,
    "confirmed_by_payment_id" "uuid",
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edition_id" "uuid",
    "attendance_status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "attendance_updated_by" "uuid",
    "attendance_updated_at" timestamp with time zone,
    "attendance_notes" "text",
    CONSTRAINT "retreat_participations_attendance_status_check" CHECK (("attendance_status" = ANY (ARRAY['confirmed'::"text", 'present'::"text", 'absent'::"text", 'excused'::"text"])))
);


ALTER TABLE "public"."retreat_participations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."retreat_participations"."attendance_status" IS 'PresenÃ§a fÃ­sica, separada da confirmaÃ§Ã£o financeira.';



CREATE TABLE IF NOT EXISTS "public"."ride_passengers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ride_id" "uuid" NOT NULL,
    "passenger_id" "uuid" NOT NULL,
    "passenger_name" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ride_passengers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "driver_name" "text" DEFAULT ''::"text" NOT NULL,
    "driver_photo_url" "text" DEFAULT ''::"text",
    "departure_location" "text" NOT NULL,
    "departure_time" "text" DEFAULT ''::"text",
    "total_seats" integer DEFAULT 1 NOT NULL,
    "available_seats" integer DEFAULT 1 NOT NULL,
    "vehicle_type" "text" DEFAULT ''::"text",
    "status" "public"."ride_status" DEFAULT 'available'::"public"."ride_status" NOT NULL,
    "notes" "text" DEFAULT ''::"text",
    "confirmed_passenger_count" integer DEFAULT 0,
    "completed_points_awarded" boolean DEFAULT false NOT NULL,
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "departure_map_url" "text",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "delete_reason" "text",
    "estimated_points" integer DEFAULT 0 NOT NULL,
    "awarded_points" integer DEFAULT 0 NOT NULL,
    "points_rule_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."rides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "shift_index" integer NOT NULL,
    "shift_start" timestamp with time zone NOT NULL,
    "shift_end" timestamp with time zone NOT NULL,
    "person_id" "uuid" NOT NULL,
    "person_name" "text" NOT NULL,
    "gender" "text" NOT NULL,
    "accommodation" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_assignments_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text"])))
);


ALTER TABLE "public"."service_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "gender" "text" NOT NULL,
    "phone" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_trail" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_people_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text"])))
);


ALTER TABLE "public"."service_people" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_scale_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "person_id" "uuid",
    "person_name" "text" NOT NULL,
    "gender" "text" NOT NULL,
    "slot_number" integer NOT NULL,
    "slot_start" timestamp with time zone NOT NULL,
    "slot_end" timestamp with time zone NOT NULL,
    "accommodation" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_scale_assignments_accommodation_check" CHECK (("accommodation" = ANY (ARRAY['male'::"text", 'female'::"text"]))),
    CONSTRAINT "service_scale_assignments_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text"])))
);


ALTER TABLE "public"."service_scale_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_scale_people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT 'Membro'::"text" NOT NULL,
    "gender" "text",
    "phone" "text",
    "sector" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "does_trail" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "display_name" "text" NOT NULL,
    "email" "text" DEFAULT ''::"text",
    "role" "text" DEFAULT 'member'::"text",
    "sectors" "text"[] DEFAULT '{}'::"text"[],
    CONSTRAINT "service_scale_people_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text"])))
);


ALTER TABLE "public"."service_scale_people" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_scale_slot_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "slot_number" integer NOT NULL,
    "slot_start" timestamp with time zone NOT NULL,
    "slot_end" timestamp with time zone NOT NULL,
    "men_required" integer DEFAULT 0 NOT NULL,
    "women_required" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_scale_slot_requirements_number_positive" CHECK (("slot_number" > 0)),
    CONSTRAINT "service_scale_slot_requirements_staffing_valid" CHECK (((("men_required" >= 0) AND ("men_required" <= 50)) AND (("women_required" >= 0) AND ("women_required" <= 50)) AND (("men_required" + "women_required") > 0))),
    CONSTRAINT "service_scale_slot_requirements_time_valid" CHECK (("slot_end" > "slot_start"))
);


ALTER TABLE "public"."service_scale_slot_requirements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "duration_minutes" integer DEFAULT 90 NOT NULL,
    "men_per_shift" integer DEFAULT 2 NOT NULL,
    "women_per_shift" integer DEFAULT 2 NOT NULL,
    "rest_minutes" integer DEFAULT 180 NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."service_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shirt_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shirt_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "position_x" integer DEFAULT 50 NOT NULL,
    "position_y" integer DEFAULT 50 NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shirt_images_position_x_check" CHECK ((("position_x" >= 0) AND ("position_x" <= 100))),
    CONSTRAINT "shirt_images_position_y_check" CHECK ((("position_y" >= 0) AND ("position_y" <= 100)))
);


ALTER TABLE "public"."shirt_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shirt_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "shirt_id" "uuid",
    "name" "text" NOT NULL,
    "size" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shirt_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shirt_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "total_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "public"."order_status" DEFAULT 'cart'::"public"."order_status" NOT NULL,
    "proof_url" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "delete_reason" "text",
    "proof_path" "text"
);


ALTER TABLE "public"."shirt_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shirts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT 'Fardas de um Forjado'::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "image_url" "text" DEFAULT ''::"text",
    "stock" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid"
);


ALTER TABLE "public"."shirts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action" "text" NOT NULL,
    "performed_by" "uuid",
    "performed_by_name" "text" DEFAULT ''::"text",
    "target_id" "text" DEFAULT ''::"text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trail_group_traffic" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "station_id" "uuid",
    "origin_station_id" "uuid",
    "destination_station_id" "uuid",
    "marker_x" numeric(5,2) DEFAULT 8 NOT NULL,
    "marker_y" numeric(5,2) DEFAULT 42 NOT NULL,
    "movement_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "traffic_signal" "text" DEFAULT 'clear'::"text" NOT NULL,
    "delay_minutes" integer DEFAULT 0 NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "updated_by" "uuid",
    "updated_by_name" "text" DEFAULT 'Sistema'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trail_group_traffic_delay_check" CHECK ((("delay_minutes" >= 0) AND ("delay_minutes" <= 720))),
    CONSTRAINT "trail_group_traffic_notes_check" CHECK (("char_length"("notes") <= 1000)),
    CONSTRAINT "trail_group_traffic_position_check" CHECK (((("marker_x" >= (0)::numeric) AND ("marker_x" <= (100)::numeric)) AND (("marker_y" >= (0)::numeric) AND ("marker_y" <= (100)::numeric)))),
    CONSTRAINT "trail_group_traffic_signal_check" CHECK (("traffic_signal" = ANY (ARRAY['clear'::"text", 'hold'::"text", 'attention'::"text"]))),
    CONSTRAINT "trail_group_traffic_status_check" CHECK (("movement_status" = ANY (ARRAY['not_started'::"text", 'at_station'::"text", 'moving'::"text", 'holding'::"text", 'delayed'::"text", 'finished'::"text"])))
);


ALTER TABLE "public"."trail_group_traffic" OWNER TO "postgres";


COMMENT ON TABLE "public"."trail_group_traffic" IS 'Ultima posicao manual e ordem operacional de cada grupo no painel de trafego.';



CREATE TABLE IF NOT EXISTS "public"."trail_group_traffic_history" (
    "id" bigint NOT NULL,
    "traffic_id" "uuid" NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "station_id" "uuid",
    "origin_station_id" "uuid",
    "destination_station_id" "uuid",
    "marker_x" numeric(5,2) NOT NULL,
    "marker_y" numeric(5,2) NOT NULL,
    "movement_status" "text" NOT NULL,
    "traffic_signal" "text" NOT NULL,
    "delay_minutes" integer DEFAULT 0 NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "changed_by" "uuid",
    "changed_by_name" "text" DEFAULT 'Sistema'::"text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trail_group_traffic_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."trail_group_traffic_history" IS 'Historico imutavel das atualizacoes manuais de posicao dos grupos.';



ALTER TABLE "public"."trail_group_traffic_history" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."trail_group_traffic_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."trail_map_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "from_station_id" "uuid" NOT NULL,
    "to_station_id" "uuid" NOT NULL,
    "connection_kind" "text" DEFAULT 'trail'::"text" NOT NULL,
    "is_bidirectional" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trail_map_connections_distinct_check" CHECK (("from_station_id" <> "to_station_id")),
    CONSTRAINT "trail_map_connections_kind_check" CHECK (("connection_kind" = ANY (ARRAY['trail'::"text", 'connector'::"text", 'hold'::"text"])))
);


ALTER TABLE "public"."trail_map_connections" OWNER TO "postgres";


COMMENT ON TABLE "public"."trail_map_connections" IS 'Ligacoes visuais e segmentos usados para detectar conflitos de trajeto.';



CREATE TABLE IF NOT EXISTS "public"."trail_map_stations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "service_unit_id" "uuid",
    "station_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "short_label" "text" DEFAULT ''::"text" NOT NULL,
    "station_kind" "text" DEFAULT 'station'::"text" NOT NULL,
    "x_percent" numeric(5,2) NOT NULL,
    "y_percent" numeric(5,2) NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trail_map_stations_key_check" CHECK (("station_key" ~ '^[a-z0-9_]{2,60}$'::"text")),
    CONSTRAINT "trail_map_stations_kind_check" CHECK (("station_kind" = ANY (ARRAY['station'::"text", 'gate'::"text", 'qg'::"text", 'field'::"text", 'reveal'::"text", 'hold'::"text"]))),
    CONSTRAINT "trail_map_stations_label_check" CHECK ((("char_length"(TRIM(BOTH FROM "label")) >= 2) AND ("char_length"(TRIM(BOTH FROM "label")) <= 120))),
    CONSTRAINT "trail_map_stations_position_check" CHECK (((("x_percent" >= (0)::numeric) AND ("x_percent" <= (100)::numeric)) AND (("y_percent" >= (0)::numeric) AND ("y_percent" <= (100)::numeric)))),
    CONSTRAINT "trail_map_stations_short_label_check" CHECK (("char_length"("short_label") <= 40))
);


ALTER TABLE "public"."trail_map_stations" OWNER TO "postgres";


COMMENT ON TABLE "public"."trail_map_stations" IS 'Estacoes visuais do mapa de trilhas, posicionadas por porcentagem em cada edicao.';



CREATE TABLE IF NOT EXISTS "public"."trail_route_execution_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "execution_id" "uuid" NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "plan_step_id" "uuid",
    "station_id" "uuid",
    "label" "text" NOT NULL,
    "original_order" integer NOT NULL,
    "live_order" integer NOT NULL,
    "stay_minutes" integer NOT NULL,
    "travel_minutes" integer DEFAULT 0 NOT NULL,
    "planned_arrival_at" timestamp with time zone NOT NULL,
    "eta_at" timestamp with time zone NOT NULL,
    "checked_in_at" timestamp with time zone,
    "checked_out_at" timestamp with time zone,
    "step_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_break" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trail_route_execution_steps_status_check" CHECK (("step_status" = ANY (ARRAY['pending'::"text", 'current'::"text", 'completed'::"text", 'skipped'::"text"]))),
    CONSTRAINT "trail_route_execution_steps_stay_check" CHECK ((("stay_minutes" >= 1) AND ("stay_minutes" <= 360))),
    CONSTRAINT "trail_route_execution_steps_times_check" CHECK ((("checked_out_at" IS NULL) OR ("checked_in_at" IS NULL) OR ("checked_out_at" >= "checked_in_at"))),
    CONSTRAINT "trail_route_execution_steps_travel_check" CHECK ((("travel_minutes" >= 0) AND ("travel_minutes" <= 180)))
);


ALTER TABLE "public"."trail_route_execution_steps" OWNER TO "postgres";


COMMENT ON TABLE "public"."trail_route_execution_steps" IS 'Copia reordenavel da rota com check-ins reais e ETAs recalculados.';



CREATE TABLE IF NOT EXISTS "public"."trail_route_executions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "plan_id" "uuid",
    "run_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "finished_at" timestamp with time zone,
    "schedule_variance_minutes" integer DEFAULT 0 NOT NULL,
    "estimated_finish_at" timestamp with time zone,
    "updated_by" "uuid",
    "updated_by_name" "text" DEFAULT 'Sistema'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trail_route_executions_finish_check" CHECK (((("run_status" = 'active'::"text") AND ("finished_at" IS NULL)) OR (("run_status" = 'finished'::"text") AND ("finished_at" IS NOT NULL)))),
    CONSTRAINT "trail_route_executions_status_check" CHECK (("run_status" = ANY (ARRAY['active'::"text", 'finished'::"text"]))),
    CONSTRAINT "trail_route_executions_variance_check" CHECK ((("schedule_variance_minutes" >= '-720'::integer) AND ("schedule_variance_minutes" <= 720)))
);


ALTER TABLE "public"."trail_route_executions" OWNER TO "postgres";


COMMENT ON TABLE "public"."trail_route_executions" IS 'Execucao viva e independente da rota durante o evento.';



CREATE TABLE IF NOT EXISTS "public"."trail_route_plan_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "station_id" "uuid",
    "label" "text" NOT NULL,
    "ideal_order" integer NOT NULL,
    "stay_minutes" integer DEFAULT 5 NOT NULL,
    "travel_minutes" integer DEFAULT 0 NOT NULL,
    "is_break" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trail_route_plan_steps_label_check" CHECK ((("char_length"(TRIM(BOTH FROM "label")) >= 2) AND ("char_length"(TRIM(BOTH FROM "label")) <= 120))),
    CONSTRAINT "trail_route_plan_steps_stay_check" CHECK ((("stay_minutes" >= 1) AND ("stay_minutes" <= 360))),
    CONSTRAINT "trail_route_plan_steps_travel_check" CHECK ((("travel_minutes" >= 0) AND ("travel_minutes" <= 180)))
);


ALTER TABLE "public"."trail_route_plan_steps" OWNER TO "postgres";


COMMENT ON TABLE "public"."trail_route_plan_steps" IS 'Etapas ideais com permanencia e deslocamento, editadas na aba Grupos.';



CREATE TABLE IF NOT EXISTS "public"."trail_route_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "edition_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trail_route_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."trail_route_plans" IS 'Planejamento ideal e preservado da rota de cada grupo.';



CREATE TABLE IF NOT EXISTS "public"."web_push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "subscription" "jsonb" NOT NULL,
    "user_agent" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."web_push_subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_deletion_receipts"
    ADD CONSTRAINT "account_deletion_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_notifications"
    ADD CONSTRAINT "app_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automated_messages"
    ADD CONSTRAINT "automated_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."edition_enrollments"
    ADD CONSTRAINT "edition_enrollments_edition_id_user_id_key" UNIQUE ("edition_id", "user_id");



ALTER TABLE ONLY "public"."edition_enrollments"
    ADD CONSTRAINT "edition_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_schedule_items"
    ADD CONSTRAINT "event_schedule_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_service_assignments"
    ADD CONSTRAINT "event_service_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_service_positions"
    ADD CONSTRAINT "event_service_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_service_slots"
    ADD CONSTRAINT "event_service_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_service_units"
    ADD CONSTRAINT "event_service_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forjados_editions"
    ADD CONSTRAINT "forjados_editions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."honor_goals"
    ADD CONSTRAINT "honor_goals_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."internal_runtime_secrets"
    ADD CONSTRAINT "internal_runtime_secrets_pkey" PRIMARY KEY ("secret_name");



ALTER TABLE ONLY "public"."material_item_history"
    ADD CONSTRAINT "material_item_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_items"
    ADD CONSTRAINT "material_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_movements"
    ADD CONSTRAINT "material_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_receipts"
    ADD CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."points_redemptions"
    ADD CONSTRAINT "points_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."points_store_product_images"
    ADD CONSTRAINT "points_store_product_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."points_store_products"
    ADD CONSTRAINT "points_store_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_redemptions"
    ADD CONSTRAINT "product_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_member_id_key" UNIQUE ("member_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_panel_items"
    ADD CONSTRAINT "public_panel_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_notification_queue"
    ADD CONSTRAINT "push_notification_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retreat_events"
    ADD CONSTRAINT "retreat_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retreat_participations"
    ADD CONSTRAINT "retreat_participations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_passengers"
    ADD CONSTRAINT "ride_passengers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_passengers"
    ADD CONSTRAINT "ride_passengers_ride_id_passenger_id_key" UNIQUE ("ride_id", "passenger_id");



ALTER TABLE ONLY "public"."ride_settings"
    ADD CONSTRAINT "ride_settings_pkey" PRIMARY KEY ("singleton");



ALTER TABLE ONLY "public"."rides"
    ADD CONSTRAINT "rides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_assignments"
    ADD CONSTRAINT "service_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_people"
    ADD CONSTRAINT "service_people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_scale_assignments"
    ADD CONSTRAINT "service_scale_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_scale_people"
    ADD CONSTRAINT "service_scale_people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_scale_people"
    ADD CONSTRAINT "service_scale_people_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."service_scale_schedules"
    ADD CONSTRAINT "service_scale_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_scale_slot_requirements"
    ADD CONSTRAINT "service_scale_slot_requirements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_scale_slot_requirements"
    ADD CONSTRAINT "service_scale_slot_requirements_schedule_slot_unique" UNIQUE ("schedule_id", "slot_number");



ALTER TABLE ONLY "public"."service_schedules"
    ADD CONSTRAINT "service_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shirt_images"
    ADD CONSTRAINT "shirt_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shirt_order_items"
    ADD CONSTRAINT "shirt_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shirt_orders"
    ADD CONSTRAINT "shirt_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shirts"
    ADD CONSTRAINT "shirts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trail_group_traffic"
    ADD CONSTRAINT "trail_group_traffic_edition_id_group_id_key" UNIQUE ("edition_id", "group_id");



ALTER TABLE ONLY "public"."trail_group_traffic_history"
    ADD CONSTRAINT "trail_group_traffic_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trail_group_traffic"
    ADD CONSTRAINT "trail_group_traffic_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trail_map_connections"
    ADD CONSTRAINT "trail_map_connections_edition_id_from_station_id_to_station_key" UNIQUE ("edition_id", "from_station_id", "to_station_id");



ALTER TABLE ONLY "public"."trail_map_connections"
    ADD CONSTRAINT "trail_map_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trail_map_stations"
    ADD CONSTRAINT "trail_map_stations_edition_id_id_key" UNIQUE ("edition_id", "id");



ALTER TABLE ONLY "public"."trail_map_stations"
    ADD CONSTRAINT "trail_map_stations_edition_id_station_key_key" UNIQUE ("edition_id", "station_key");



ALTER TABLE ONLY "public"."trail_map_stations"
    ADD CONSTRAINT "trail_map_stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trail_route_execution_steps"
    ADD CONSTRAINT "trail_route_execution_steps_execution_id_live_order_key" UNIQUE ("execution_id", "live_order") DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."trail_route_execution_steps"
    ADD CONSTRAINT "trail_route_execution_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trail_route_executions"
    ADD CONSTRAINT "trail_route_executions_edition_id_group_id_key" UNIQUE ("edition_id", "group_id");



ALTER TABLE ONLY "public"."trail_route_executions"
    ADD CONSTRAINT "trail_route_executions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trail_route_plan_steps"
    ADD CONSTRAINT "trail_route_plan_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trail_route_plan_steps"
    ADD CONSTRAINT "trail_route_plan_steps_plan_id_ideal_order_key" UNIQUE ("plan_id", "ideal_order") DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."trail_route_plans"
    ADD CONSTRAINT "trail_route_plans_edition_id_group_id_key" UNIQUE ("edition_id", "group_id");



ALTER TABLE ONLY "public"."trail_route_plans"
    ADD CONSTRAINT "trail_route_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."web_push_subscriptions"
    ADD CONSTRAINT "web_push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."web_push_subscriptions"
    ADD CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id");



CREATE INDEX "account_deletion_receipts_retain_until_idx" ON "public"."account_deletion_receipts" USING "btree" ("retain_until");



CREATE INDEX "app_notifications_read_receipts_idx" ON "public"."app_notifications" USING "btree" ("created_at" DESC, "user_id") WHERE ("is_read" = true);



CREATE INDEX "app_notifications_receipts_visible_idx" ON "public"."app_notifications" USING "btree" ("created_at" DESC) WHERE (("receipt_archived_at" IS NULL) AND ("user_id" IS NOT NULL));



CREATE INDEX "app_notifications_visible_user_idx" ON "public"."app_notifications" USING "btree" ("user_id", "is_pinned" DESC, "created_at" DESC) WHERE ("cleared_at" IS NULL);



CREATE INDEX "audit_logs_actor_id_idx" ON "public"."audit_logs" USING "btree" ("actor_id");



CREATE INDEX "automated_messages_active_scheduled_idx" ON "public"."automated_messages" USING "btree" ("scheduled_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "chat_messages_receiver_id_idx" ON "public"."chat_messages" USING "btree" ("receiver_id");



CREATE INDEX "chat_messages_sender_id_idx" ON "public"."chat_messages" USING "btree" ("sender_id");



CREATE INDEX "edition_enrollments_user_id_idx" ON "public"."edition_enrollments" USING "btree" ("user_id");



CREATE INDEX "event_schedule_items_created_by_idx" ON "public"."event_schedule_items" USING "btree" ("created_by");



CREATE INDEX "event_schedule_items_edition_start_idx" ON "public"."event_schedule_items" USING "btree" ("edition_id", "starts_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "event_schedule_items_published_start_idx" ON "public"."event_schedule_items" USING "btree" ("starts_at") WHERE (("is_published" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "event_schedule_items_responsible_id_idx" ON "public"."event_schedule_items" USING "btree" ("responsible_id") WHERE (("responsible_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "event_schedule_items_route_idx" ON "public"."event_schedule_items" USING "btree" ("edition_id", "schedule_kind", "route_order") WHERE ("deleted_at" IS NULL);



CREATE INDEX "event_schedule_items_service_unit_idx" ON "public"."event_schedule_items" USING "btree" ("service_unit_id") WHERE (("service_unit_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "event_service_assignments_character_idx" ON "public"."event_service_assignments" USING "btree" ("linked_character_id") WHERE ("linked_character_id" IS NOT NULL);



CREATE INDEX "event_service_assignments_created_by_idx" ON "public"."event_service_assignments" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "event_service_assignments_edition_idx" ON "public"."event_service_assignments" USING "btree" ("edition_id", "display_order", "person_name");



CREATE INDEX "event_service_assignments_group_idx" ON "public"."event_service_assignments" USING "btree" ("group_id") WHERE ("group_id" IS NOT NULL);



CREATE INDEX "event_service_assignments_position_idx" ON "public"."event_service_assignments" USING "btree" ("position_id") WHERE ("position_id" IS NOT NULL);



CREATE UNIQUE INDEX "event_service_assignments_primary_sector_idx" ON "public"."event_service_assignments" USING "btree" ("edition_id", "user_id") WHERE (("user_id" IS NOT NULL) AND ("is_primary" IS TRUE));



CREATE INDEX "event_service_assignments_unit_idx" ON "public"."event_service_assignments" USING "btree" ("unit_id", "display_order", "person_name");



CREATE INDEX "event_service_assignments_user_idx" ON "public"."event_service_assignments" USING "btree" ("user_id", "edition_id") WHERE ("user_id" IS NOT NULL);



CREATE UNIQUE INDEX "event_service_assignments_user_unit_group_idx" ON "public"."event_service_assignments" USING "btree" ("unit_id", "user_id", COALESCE("group_id", '00000000-0000-0000-0000-000000000000'::"uuid")) WHERE ("user_id" IS NOT NULL);



CREATE UNIQUE INDEX "event_service_positions_unique_name_idx" ON "public"."event_service_positions" USING "btree" ("unit_id", "lower"("name"));



CREATE INDEX "event_service_positions_unit_order_idx" ON "public"."event_service_positions" USING "btree" ("unit_id", "display_order", "name");



CREATE INDEX "event_service_slots_created_by_idx" ON "public"."event_service_slots" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "event_service_slots_edition_start_idx" ON "public"."event_service_slots" USING "btree" ("edition_id", "starts_at");



CREATE INDEX "event_service_slots_location_idx" ON "public"."event_service_slots" USING "btree" ("location_id") WHERE ("location_id" IS NOT NULL);



CREATE INDEX "event_service_slots_unit_start_idx" ON "public"."event_service_slots" USING "btree" ("unit_id", "starts_at");



CREATE INDEX "event_service_units_created_by_idx" ON "public"."event_service_units" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "event_service_units_edition_type_order_idx" ON "public"."event_service_units" USING "btree" ("edition_id", "unit_type", "display_order", "name");



CREATE UNIQUE INDEX "event_service_units_unique_name_idx" ON "public"."event_service_units" USING "btree" ("edition_id", "unit_type", "lower"("name"));



CREATE UNIQUE INDEX "forjados_editions_one_active_idx" ON "public"."forjados_editions" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "honor_goals_product_id_idx" ON "public"."honor_goals" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "idx_app_notifications_user_read" ON "public"."app_notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_automated_messages_due" ON "public"."automated_messages" USING "btree" ("status", "scheduled_at");



CREATE INDEX "idx_automated_messages_target" ON "public"."automated_messages" USING "btree" ("target", "target_team");



CREATE INDEX "idx_messages_chat" ON "public"."chat_messages" USING "btree" ("chat_id");



CREATE INDEX "idx_orders_user" ON "public"."shirt_orders" USING "btree" ("user_id");



CREATE INDEX "idx_points_store_product_images_order" ON "public"."points_store_product_images" USING "btree" ("product_id", "display_order", "created_at");



CREATE INDEX "idx_points_store_product_images_product_id" ON "public"."points_store_product_images" USING "btree" ("product_id");



CREATE INDEX "idx_points_user" ON "public"."point_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_sectors" ON "public"."profiles" USING "gin" ("sectors");



CREATE INDEX "idx_profiles_status" ON "public"."profiles" USING "btree" ("inscription_status");



CREATE INDEX "idx_public_panel_items_active" ON "public"."public_panel_items" USING "btree" ("is_active", "is_pinned", "published_at" DESC);



CREATE INDEX "idx_receipts_status" ON "public"."payment_receipts" USING "btree" ("status");



CREATE INDEX "idx_receipts_user" ON "public"."payment_receipts" USING "btree" ("user_id");



CREATE INDEX "idx_rides_driver" ON "public"."rides" USING "btree" ("driver_id");



CREATE INDEX "idx_service_scale_assignments_schedule" ON "public"."service_scale_assignments" USING "btree" ("schedule_id", "slot_number");



CREATE INDEX "idx_service_scale_people_active" ON "public"."service_scale_people" USING "btree" ("is_active", "does_trail");



CREATE INDEX "idx_service_scale_people_gender" ON "public"."service_scale_people" USING "btree" ("gender");



CREATE INDEX "idx_service_scale_people_user_id" ON "public"."service_scale_people" USING "btree" ("user_id");



CREATE INDEX "idx_shirt_images_order" ON "public"."shirt_images" USING "btree" ("shirt_id", "display_order", "created_at");



CREATE INDEX "idx_shirt_images_shirt_id" ON "public"."shirt_images" USING "btree" ("shirt_id");



CREATE INDEX "material_item_history_created_by_idx" ON "public"."material_item_history" USING "btree" ("created_by");



CREATE INDEX "material_item_history_edition_id_idx" ON "public"."material_item_history" USING "btree" ("edition_id");



CREATE INDEX "material_item_history_item_created_idx" ON "public"."material_item_history" USING "btree" ("item_id", "created_at" DESC);



CREATE INDEX "material_item_history_sector_unit_id_idx" ON "public"."material_item_history" USING "btree" ("sector_unit_id");



CREATE INDEX "material_items_created_by_idx" ON "public"."material_items" USING "btree" ("created_by");



CREATE INDEX "material_items_edition_sector_idx" ON "public"."material_items" USING "btree" ("edition_id", "sector_unit_id", "is_archived", "name");



CREATE INDEX "material_items_filters_idx" ON "public"."material_items" USING "btree" ("edition_id", "item_type", "status", "condition") WHERE ("is_archived" IS FALSE);



CREATE INDEX "material_items_low_stock_idx" ON "public"."material_items" USING "btree" ("edition_id", "quantity", "minimum_quantity") WHERE ("is_archived" IS FALSE);



CREATE INDEX "material_items_sector_unit_id_idx" ON "public"."material_items" USING "btree" ("sector_unit_id");



CREATE INDEX "material_items_updated_by_idx" ON "public"."material_items" USING "btree" ("updated_by");



CREATE INDEX "material_movements_created_by_idx" ON "public"."material_movements" USING "btree" ("created_by", "created_at" DESC) WHERE ("created_by" IS NOT NULL);



CREATE INDEX "material_movements_edition_sector_idx" ON "public"."material_movements" USING "btree" ("edition_id", "sector_unit_id", "created_at" DESC);



CREATE INDEX "material_movements_item_created_idx" ON "public"."material_movements" USING "btree" ("item_id", "created_at" DESC);



CREATE INDEX "material_movements_sector_unit_id_idx" ON "public"."material_movements" USING "btree" ("sector_unit_id");



CREATE INDEX "notifications_user_id_idx" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "offers_active_created_idx" ON "public"."offers" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "offers_proof_path_idx" ON "public"."offers" USING "btree" ("proof_path") WHERE ("proof_path" IS NOT NULL);



CREATE INDEX "offers_user_created_idx" ON "public"."offers" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "payment_receipts_active_uploaded_idx" ON "public"."payment_receipts" USING "btree" ("uploaded_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "payment_receipts_edition_id_idx" ON "public"."payment_receipts" USING "btree" ("edition_id") WHERE ("edition_id" IS NOT NULL);



CREATE INDEX "payment_receipts_file_path_idx" ON "public"."payment_receipts" USING "btree" ("file_path") WHERE ("file_path" IS NOT NULL);



CREATE INDEX "payment_receipts_reviewed_by_idx" ON "public"."payment_receipts" USING "btree" ("reviewed_by") WHERE ("reviewed_by" IS NOT NULL);



CREATE INDEX "payment_receipts_user_edition_uploaded_idx" ON "public"."payment_receipts" USING "btree" ("user_id", "edition_id", "uploaded_at" DESC);



CREATE INDEX "point_transactions_active_created_idx" ON "public"."point_transactions" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "point_transactions_granted_by_idx" ON "public"."point_transactions" USING "btree" ("granted_by");



CREATE INDEX "points_redemptions_active_created_idx" ON "public"."points_redemptions" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "points_redemptions_delivered_by_idx" ON "public"."points_redemptions" USING "btree" ("delivered_by");



CREATE INDEX "points_redemptions_product_id_idx" ON "public"."points_redemptions" USING "btree" ("product_id");



CREATE INDEX "points_redemptions_user_id_idx" ON "public"."points_redemptions" USING "btree" ("user_id");



CREATE INDEX "points_store_products_deleted_by_idx" ON "public"."points_store_products" USING "btree" ("deleted_by");



CREATE INDEX "product_redemptions_product_id_idx" ON "public"."product_redemptions" USING "btree" ("product_id");



CREATE INDEX "product_redemptions_user_id_idx" ON "public"."product_redemptions" USING "btree" ("user_id");



CREATE INDEX "profiles_direct_leader_id_idx" ON "public"."profiles" USING "btree" ("direct_leader_id") WHERE ("direct_leader_id" IS NOT NULL);



CREATE INDEX "public_panel_items_active_created_idx" ON "public"."public_panel_items" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "public_panel_items_created_by_idx" ON "public"."public_panel_items" USING "btree" ("created_by");



CREATE INDEX "public_panel_items_updated_by_idx" ON "public"."public_panel_items" USING "btree" ("updated_by");



CREATE INDEX "push_notification_queue_notification_id_idx" ON "public"."push_notification_queue" USING "btree" ("notification_id");



CREATE INDEX "push_notification_queue_status_idx" ON "public"."push_notification_queue" USING "btree" ("status", "created_at");



CREATE INDEX "push_notification_queue_user_idx" ON "public"."push_notification_queue" USING "btree" ("user_id");



CREATE INDEX "retreat_participations_attendance_idx" ON "public"."retreat_participations" USING "btree" ("edition_id", "attendance_status");



CREATE INDEX "retreat_participations_attendance_updated_by_idx" ON "public"."retreat_participations" USING "btree" ("attendance_updated_by") WHERE ("attendance_updated_by" IS NOT NULL);



CREATE INDEX "retreat_participations_edition_id_idx" ON "public"."retreat_participations" USING "btree" ("edition_id") WHERE ("edition_id" IS NOT NULL);



CREATE UNIQUE INDEX "retreat_participations_legacy_title_unique" ON "public"."retreat_participations" USING "btree" ("user_id", "retreat_title") WHERE ("edition_id" IS NULL);



CREATE UNIQUE INDEX "retreat_participations_user_edition_unique" ON "public"."retreat_participations" USING "btree" ("user_id", "edition_id") WHERE ("edition_id" IS NOT NULL);



CREATE INDEX "ride_passengers_passenger_id_idx" ON "public"."ride_passengers" USING "btree" ("passenger_id");



CREATE INDEX "ride_settings_updated_by_idx" ON "public"."ride_settings" USING "btree" ("updated_by");



CREATE INDEX "rides_active_created_idx" ON "public"."rides" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "rides_confirmed_by_idx" ON "public"."rides" USING "btree" ("confirmed_by");



CREATE INDEX "service_assignments_person_id_idx" ON "public"."service_assignments" USING "btree" ("person_id");



CREATE INDEX "service_assignments_schedule_idx" ON "public"."service_assignments" USING "btree" ("schedule_id");



CREATE INDEX "service_assignments_shift_idx" ON "public"."service_assignments" USING "btree" ("shift_start");



CREATE INDEX "service_people_active_idx" ON "public"."service_people" USING "btree" ("is_active", "is_trail");



CREATE INDEX "service_people_gender_idx" ON "public"."service_people" USING "btree" ("gender");



CREATE INDEX "service_scale_assignments_person_id_idx" ON "public"."service_scale_assignments" USING "btree" ("person_id");



CREATE INDEX "service_scale_schedules_active_created_idx" ON "public"."service_scale_schedules" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "service_scale_schedules_created_by_idx" ON "public"."service_scale_schedules" USING "btree" ("created_by");



CREATE INDEX "service_scale_schedules_edition_type_idx" ON "public"."service_scale_schedules" USING "btree" ("edition_id", "scale_type", "start_at") WHERE (("deleted_at" IS NULL) AND ("status" = 'published'::"text"));



CREATE INDEX "service_scale_schedules_service_unit_id_idx" ON "public"."service_scale_schedules" USING "btree" ("service_unit_id");



CREATE INDEX "service_scale_slot_requirements_schedule_start_idx" ON "public"."service_scale_slot_requirements" USING "btree" ("schedule_id", "slot_start");



CREATE INDEX "service_schedules_created_by_idx" ON "public"."service_schedules" USING "btree" ("created_by");



CREATE INDEX "shirt_order_items_order_id_idx" ON "public"."shirt_order_items" USING "btree" ("order_id");



CREATE INDEX "shirt_order_items_shirt_id_idx" ON "public"."shirt_order_items" USING "btree" ("shirt_id") WHERE ("shirt_id" IS NOT NULL);



CREATE INDEX "shirt_orders_active_created_idx" ON "public"."shirt_orders" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "shirt_orders_proof_path_idx" ON "public"."shirt_orders" USING "btree" ("proof_path") WHERE ("proof_path" IS NOT NULL);



CREATE INDEX "shirt_orders_user_created_idx" ON "public"."shirt_orders" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "shirts_deleted_by_idx" ON "public"."shirts" USING "btree" ("deleted_by") WHERE ("deleted_by" IS NOT NULL);



CREATE INDEX "system_logs_performed_by_idx" ON "public"."system_logs" USING "btree" ("performed_by");



CREATE INDEX "trail_group_traffic_destination_idx" ON "public"."trail_group_traffic" USING "btree" ("destination_station_id") WHERE ("destination_station_id" IS NOT NULL);



CREATE INDEX "trail_group_traffic_edition_updated_idx" ON "public"."trail_group_traffic" USING "btree" ("edition_id", "updated_at" DESC);



CREATE INDEX "trail_group_traffic_group_idx" ON "public"."trail_group_traffic" USING "btree" ("group_id");



CREATE INDEX "trail_group_traffic_history_changed_by_idx" ON "public"."trail_group_traffic_history" USING "btree" ("changed_by") WHERE ("changed_by" IS NOT NULL);



CREATE INDEX "trail_group_traffic_history_destination_idx" ON "public"."trail_group_traffic_history" USING "btree" ("destination_station_id") WHERE ("destination_station_id" IS NOT NULL);



CREATE INDEX "trail_group_traffic_history_edition_changed_idx" ON "public"."trail_group_traffic_history" USING "btree" ("edition_id", "changed_at" DESC);



CREATE INDEX "trail_group_traffic_history_group_changed_idx" ON "public"."trail_group_traffic_history" USING "btree" ("group_id", "changed_at" DESC);



CREATE INDEX "trail_group_traffic_history_origin_idx" ON "public"."trail_group_traffic_history" USING "btree" ("origin_station_id") WHERE ("origin_station_id" IS NOT NULL);



CREATE INDEX "trail_group_traffic_history_station_idx" ON "public"."trail_group_traffic_history" USING "btree" ("station_id") WHERE ("station_id" IS NOT NULL);



CREATE INDEX "trail_group_traffic_history_traffic_idx" ON "public"."trail_group_traffic_history" USING "btree" ("traffic_id");



CREATE INDEX "trail_group_traffic_origin_idx" ON "public"."trail_group_traffic" USING "btree" ("origin_station_id") WHERE ("origin_station_id" IS NOT NULL);



CREATE INDEX "trail_group_traffic_station_idx" ON "public"."trail_group_traffic" USING "btree" ("station_id") WHERE ("station_id" IS NOT NULL);



CREATE INDEX "trail_group_traffic_updated_by_idx" ON "public"."trail_group_traffic" USING "btree" ("updated_by") WHERE ("updated_by" IS NOT NULL);



CREATE INDEX "trail_map_connections_edition_order_idx" ON "public"."trail_map_connections" USING "btree" ("edition_id", "display_order");



CREATE INDEX "trail_map_connections_to_station_idx" ON "public"."trail_map_connections" USING "btree" ("edition_id", "to_station_id");



CREATE INDEX "trail_map_stations_edition_order_idx" ON "public"."trail_map_stations" USING "btree" ("edition_id", "display_order", "label") WHERE ("is_active" IS TRUE);



CREATE INDEX "trail_map_stations_service_unit_idx" ON "public"."trail_map_stations" USING "btree" ("service_unit_id") WHERE ("service_unit_id" IS NOT NULL);



CREATE INDEX "trail_route_execution_steps_edition_group_order_idx" ON "public"."trail_route_execution_steps" USING "btree" ("edition_id", "group_id", "live_order");



CREATE INDEX "trail_route_execution_steps_execution_status_order_idx" ON "public"."trail_route_execution_steps" USING "btree" ("execution_id", "step_status", "live_order");



CREATE INDEX "trail_route_execution_steps_group_idx" ON "public"."trail_route_execution_steps" USING "btree" ("group_id");



CREATE INDEX "trail_route_execution_steps_plan_step_idx" ON "public"."trail_route_execution_steps" USING "btree" ("plan_step_id") WHERE ("plan_step_id" IS NOT NULL);



CREATE INDEX "trail_route_execution_steps_station_idx" ON "public"."trail_route_execution_steps" USING "btree" ("station_id") WHERE ("station_id" IS NOT NULL);



CREATE INDEX "trail_route_executions_edition_status_idx" ON "public"."trail_route_executions" USING "btree" ("edition_id", "run_status", "updated_at" DESC);



CREATE INDEX "trail_route_executions_group_idx" ON "public"."trail_route_executions" USING "btree" ("group_id");



CREATE INDEX "trail_route_executions_plan_idx" ON "public"."trail_route_executions" USING "btree" ("plan_id") WHERE ("plan_id" IS NOT NULL);



CREATE INDEX "trail_route_executions_updated_by_idx" ON "public"."trail_route_executions" USING "btree" ("updated_by") WHERE ("updated_by" IS NOT NULL);



CREATE INDEX "trail_route_plan_steps_edition_group_order_idx" ON "public"."trail_route_plan_steps" USING "btree" ("edition_id", "group_id", "ideal_order");



CREATE INDEX "trail_route_plan_steps_group_idx" ON "public"."trail_route_plan_steps" USING "btree" ("group_id");



CREATE INDEX "trail_route_plan_steps_station_idx" ON "public"."trail_route_plan_steps" USING "btree" ("station_id") WHERE ("station_id" IS NOT NULL);



CREATE INDEX "trail_route_plans_group_idx" ON "public"."trail_route_plans" USING "btree" ("group_id");



CREATE UNIQUE INDEX "uq_points_store_product_images_primary" ON "public"."points_store_product_images" USING "btree" ("product_id") WHERE ("is_primary" = true);



CREATE UNIQUE INDEX "uq_shirt_images_primary" ON "public"."shirt_images" USING "btree" ("shirt_id") WHERE ("is_primary" = true);



CREATE INDEX "web_push_subscriptions_active_idx" ON "public"."web_push_subscriptions" USING "btree" ("is_active");



CREATE INDEX "web_push_subscriptions_user_idx" ON "public"."web_push_subscriptions" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "forjados_protect_profile_member_since_v1" BEFORE UPDATE OF "member_since" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."forjados_protect_profile_member_since_v1"();



CREATE OR REPLACE TRIGGER "honor_goals_set_updated_at" BEFORE UPDATE ON "public"."honor_goals" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "prepare_trail_group_traffic" BEFORE INSERT OR UPDATE ON "public"."trail_group_traffic" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_prepare_trail_group_traffic_v1"();



CREATE OR REPLACE TRIGGER "record_trail_group_traffic" AFTER INSERT OR UPDATE ON "public"."trail_group_traffic" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_record_trail_group_traffic_v1"();



CREATE OR REPLACE TRIGGER "rides_prepare_points" BEFORE INSERT OR UPDATE OF "total_seats" ON "public"."rides" FOR EACH ROW EXECUTE FUNCTION "public"."forjados_prepare_ride_points_v1"();



CREATE OR REPLACE TRIGGER "set_chats_updated_at" BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_event_schedule_items_updated_at" BEFORE UPDATE ON "public"."event_schedule_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_event_service_assignments_updated_at" BEFORE UPDATE ON "public"."event_service_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_event_service_positions_updated_at" BEFORE UPDATE ON "public"."event_service_positions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_event_service_slots_updated_at" BEFORE UPDATE ON "public"."event_service_slots" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_event_service_units_updated_at" BEFORE UPDATE ON "public"."event_service_units" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_payment_receipts_updated_at" BEFORE UPDATE ON "public"."payment_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_product_redemptions_updated_at" BEFORE UPDATE ON "public"."product_redemptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_rides_updated_at" BEFORE UPDATE ON "public"."rides" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_service_people_updated_at" BEFORE UPDATE ON "public"."service_people" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_service_scale_people_updated_at" BEFORE UPDATE ON "public"."service_scale_people" FOR EACH ROW EXECUTE FUNCTION "public"."set_service_scale_updated_at"();



CREATE OR REPLACE TRIGGER "set_service_scale_schedules_updated_at" BEFORE UPDATE ON "public"."service_scale_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."set_service_scale_updated_at"();



CREATE OR REPLACE TRIGGER "set_service_schedules_updated_at" BEFORE UPDATE ON "public"."service_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_shirt_orders_updated_at" BEFORE UPDATE ON "public"."shirt_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_shirts_updated_at" BEFORE UPDATE ON "public"."shirts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_trail_map_stations_updated_at" BEFORE UPDATE ON "public"."trail_map_stations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_trail_route_execution_steps_updated_at" BEFORE UPDATE ON "public"."trail_route_execution_steps" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_trail_route_executions_updated_at" BEFORE UPDATE ON "public"."trail_route_executions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_trail_route_plan_steps_updated_at" BEFORE UPDATE ON "public"."trail_route_plan_steps" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_trail_route_plans_updated_at" BEFORE UPDATE ON "public"."trail_route_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "stamp_trail_route_execution" BEFORE INSERT OR UPDATE ON "public"."trail_route_executions" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_stamp_trail_route_execution_v1"();



CREATE OR REPLACE TRIGGER "trg_audit_event_service_assignments" AFTER INSERT OR DELETE OR UPDATE ON "public"."event_service_assignments" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_audit_event_service_change_v1"();



CREATE OR REPLACE TRIGGER "trg_audit_event_service_positions" AFTER INSERT OR DELETE OR UPDATE ON "public"."event_service_positions" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_audit_event_service_change_v1"();



CREATE OR REPLACE TRIGGER "trg_audit_event_service_slots" AFTER INSERT OR DELETE OR UPDATE ON "public"."event_service_slots" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_audit_event_service_change_v1"();



CREATE OR REPLACE TRIGGER "trg_audit_event_service_units" AFTER INSERT OR DELETE OR UPDATE ON "public"."event_service_units" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_audit_event_service_change_v1"();



CREATE OR REPLACE TRIGGER "trg_audit_material_item" AFTER INSERT OR UPDATE ON "public"."material_items" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_audit_material_item_v1"();



CREATE OR REPLACE TRIGGER "trg_clear_event_service_primary_sector" BEFORE INSERT OR UPDATE ON "public"."event_service_assignments" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_clear_previous_primary_sector_v1"();



CREATE OR REPLACE TRIGGER "trg_forjados_assign_member_id" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."forjados_assign_member_id"();



CREATE OR REPLACE TRIGGER "trg_forjados_confirm_participation_from_payment" AFTER INSERT OR UPDATE OF "status" ON "public"."payment_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."forjados_confirm_participation_from_payment"();



CREATE OR REPLACE TRIGGER "trg_forjados_notification_read_at" BEFORE UPDATE OF "is_read" ON "public"."app_notifications" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_set_notification_read_at_v1"();



CREATE OR REPLACE TRIGGER "trg_forjados_notify_new_points_product" AFTER INSERT ON "public"."points_store_products" FOR EACH ROW EXECUTE FUNCTION "public"."forjados_notify_new_store_item_v1"();



CREATE OR REPLACE TRIGGER "trg_forjados_notify_new_shirt" AFTER INSERT ON "public"."shirts" FOR EACH ROW EXECUTE FUNCTION "public"."forjados_notify_new_store_item_v1"();



CREATE OR REPLACE TRIGGER "trg_forjados_notify_offer_created" AFTER INSERT ON "public"."offers" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_notify_management_on_action_v1"();



CREATE OR REPLACE TRIGGER "trg_forjados_notify_payment_receipt_created" AFTER INSERT ON "public"."payment_receipts" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_notify_management_on_action_v1"();



CREATE OR REPLACE TRIGGER "trg_forjados_notify_points_redemption_created" AFTER INSERT ON "public"."points_redemptions" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_notify_management_on_action_v1"();



CREATE OR REPLACE TRIGGER "trg_forjados_notify_shirt_order_created" AFTER INSERT ON "public"."shirt_orders" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_notify_management_on_action_v1"();



CREATE OR REPLACE TRIGGER "trg_forjados_queue_push_from_notification" AFTER INSERT ON "public"."app_notifications" FOR EACH ROW EXECUTE FUNCTION "public"."forjados_queue_push_from_notification"();



CREATE OR REPLACE TRIGGER "trg_forjados_schedule_change" AFTER INSERT OR UPDATE ON "public"."event_schedule_items" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_handle_schedule_change_v1"();



CREATE OR REPLACE TRIGGER "trg_payment_receipt_review_notify" AFTER UPDATE OF "status" ON "public"."payment_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_payment_receipt_review_notify"();



CREATE OR REPLACE TRIGGER "trg_point_transaction_notify" AFTER INSERT ON "public"."point_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_point_transaction_notify"();



CREATE OR REPLACE TRIGGER "trg_points_store_product_images_updated_at" BEFORE UPDATE ON "public"."points_store_product_images" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prepare_event_service_assignment" BEFORE INSERT OR UPDATE ON "public"."event_service_assignments" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_prepare_event_service_assignment_v1"();



CREATE OR REPLACE TRIGGER "trg_prepare_event_service_slot" BEFORE INSERT OR UPDATE ON "public"."event_service_slots" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_prepare_event_service_slot_v1"();



CREATE OR REPLACE TRIGGER "trg_prepare_material_item" BEFORE INSERT OR UPDATE ON "public"."material_items" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_prepare_material_item_v1"();



CREATE OR REPLACE TRIGGER "trg_profile_approved_for_scale" AFTER INSERT OR UPDATE OF "inscription_status", "display_name", "full_name", "email", "role", "sectors" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_profile_approved_for_scale"();



CREATE OR REPLACE TRIGGER "trg_profile_status_notify" AFTER UPDATE OF "inscription_status" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_profile_status_notify"();



CREATE OR REPLACE TRIGGER "trg_public_panel_notify" AFTER INSERT ON "public"."public_panel_items" FOR EACH ROW EXECUTE FUNCTION "public"."handle_public_panel_notify"();



CREATE OR REPLACE TRIGGER "trg_seed_event_services_on_edition" AFTER INSERT ON "public"."forjados_editions" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_seed_event_services_on_edition_v1"();



CREATE OR REPLACE TRIGGER "trg_seed_trail_route_plan_on_group" AFTER INSERT OR UPDATE OF "edition_id", "unit_type", "is_active" ON "public"."event_service_units" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_seed_trail_route_plan_on_group_v1"();



CREATE OR REPLACE TRIGGER "trg_seed_trail_traffic_on_edition" AFTER INSERT ON "public"."forjados_editions" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_seed_trail_traffic_on_edition_v1"();



CREATE OR REPLACE TRIGGER "trg_seed_trail_traffic_on_group" AFTER INSERT OR UPDATE OF "edition_id", "unit_type", "is_active" ON "public"."event_service_units" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_seed_trail_traffic_on_group_v1"();



CREATE OR REPLACE TRIGGER "trg_shirt_images_updated_at" BEFORE UPDATE ON "public"."shirt_images" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_profile_sectors" AFTER INSERT OR DELETE OR UPDATE ON "public"."event_service_assignments" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_sync_profile_sectors_v1"();



CREATE OR REPLACE TRIGGER "validate_trail_route_plan" BEFORE INSERT OR UPDATE ON "public"."trail_route_plans" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_validate_trail_route_plan_v1"();



CREATE OR REPLACE TRIGGER "validate_trail_route_plan_step" BEFORE INSERT OR UPDATE ON "public"."trail_route_plan_steps" FOR EACH ROW EXECUTE FUNCTION "private"."forjados_validate_trail_route_plan_step_v1"();



ALTER TABLE ONLY "public"."app_notifications"
    ADD CONSTRAINT "app_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."edition_enrollments"
    ADD CONSTRAINT "edition_enrollments_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."edition_enrollments"
    ADD CONSTRAINT "edition_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_schedule_items"
    ADD CONSTRAINT "event_schedule_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_schedule_items"
    ADD CONSTRAINT "event_schedule_items_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_schedule_items"
    ADD CONSTRAINT "event_schedule_items_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_schedule_items"
    ADD CONSTRAINT "event_schedule_items_service_unit_id_fkey" FOREIGN KEY ("service_unit_id") REFERENCES "public"."event_service_units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_service_assignments"
    ADD CONSTRAINT "event_service_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_service_assignments"
    ADD CONSTRAINT "event_service_assignments_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_service_assignments"
    ADD CONSTRAINT "event_service_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."event_service_units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_service_assignments"
    ADD CONSTRAINT "event_service_assignments_linked_character_id_fkey" FOREIGN KEY ("linked_character_id") REFERENCES "public"."event_service_units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_service_assignments"
    ADD CONSTRAINT "event_service_assignments_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."event_service_positions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_service_assignments"
    ADD CONSTRAINT "event_service_assignments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."event_service_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_service_assignments"
    ADD CONSTRAINT "event_service_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_service_positions"
    ADD CONSTRAINT "event_service_positions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."event_service_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_service_slots"
    ADD CONSTRAINT "event_service_slots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_service_slots"
    ADD CONSTRAINT "event_service_slots_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_service_slots"
    ADD CONSTRAINT "event_service_slots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."event_service_units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_service_slots"
    ADD CONSTRAINT "event_service_slots_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."event_service_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_service_units"
    ADD CONSTRAINT "event_service_units_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_service_units"
    ADD CONSTRAINT "event_service_units_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."honor_goals"
    ADD CONSTRAINT "honor_goals_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."points_store_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."honor_goals"
    ADD CONSTRAINT "honor_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."material_item_history"
    ADD CONSTRAINT "material_item_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."material_item_history"
    ADD CONSTRAINT "material_item_history_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_item_history"
    ADD CONSTRAINT "material_item_history_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."material_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_item_history"
    ADD CONSTRAINT "material_item_history_sector_unit_id_fkey" FOREIGN KEY ("sector_unit_id") REFERENCES "public"."event_service_units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_items"
    ADD CONSTRAINT "material_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."material_items"
    ADD CONSTRAINT "material_items_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_items"
    ADD CONSTRAINT "material_items_sector_unit_id_fkey" FOREIGN KEY ("sector_unit_id") REFERENCES "public"."event_service_units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_items"
    ADD CONSTRAINT "material_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."material_movements"
    ADD CONSTRAINT "material_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."material_movements"
    ADD CONSTRAINT "material_movements_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_movements"
    ADD CONSTRAINT "material_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."material_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_movements"
    ADD CONSTRAINT "material_movements_sector_unit_id_fkey" FOREIGN KEY ("sector_unit_id") REFERENCES "public"."event_service_units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_receipts"
    ADD CONSTRAINT "payment_receipts_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id");



ALTER TABLE ONLY "public"."payment_receipts"
    ADD CONSTRAINT "payment_receipts_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_receipts"
    ADD CONSTRAINT "payment_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."points_redemptions"
    ADD CONSTRAINT "points_redemptions_delivered_by_fkey" FOREIGN KEY ("delivered_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."points_redemptions"
    ADD CONSTRAINT "points_redemptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."points_store_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."points_redemptions"
    ADD CONSTRAINT "points_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."points_store_product_images"
    ADD CONSTRAINT "points_store_product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."points_store_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."points_store_products"
    ADD CONSTRAINT "points_store_products_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_redemptions"
    ADD CONSTRAINT "product_redemptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_redemptions"
    ADD CONSTRAINT "product_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_direct_leader_id_fkey" FOREIGN KEY ("direct_leader_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_panel_items"
    ADD CONSTRAINT "public_panel_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."public_panel_items"
    ADD CONSTRAINT "public_panel_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_notification_queue"
    ADD CONSTRAINT "push_notification_queue_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."app_notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_notification_queue"
    ADD CONSTRAINT "push_notification_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retreat_participations"
    ADD CONSTRAINT "retreat_participations_attendance_updated_by_fkey" FOREIGN KEY ("attendance_updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."retreat_participations"
    ADD CONSTRAINT "retreat_participations_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."retreat_participations"
    ADD CONSTRAINT "retreat_participations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_passengers"
    ADD CONSTRAINT "ride_passengers_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_passengers"
    ADD CONSTRAINT "ride_passengers_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_settings"
    ADD CONSTRAINT "ride_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rides"
    ADD CONSTRAINT "rides_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rides"
    ADD CONSTRAINT "rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_assignments"
    ADD CONSTRAINT "service_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."service_people"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."service_assignments"
    ADD CONSTRAINT "service_assignments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."service_schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_scale_assignments"
    ADD CONSTRAINT "service_scale_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."service_scale_people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_scale_assignments"
    ADD CONSTRAINT "service_scale_assignments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."service_scale_schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_scale_people"
    ADD CONSTRAINT "service_scale_people_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_scale_schedules"
    ADD CONSTRAINT "service_scale_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_scale_schedules"
    ADD CONSTRAINT "service_scale_schedules_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_scale_schedules"
    ADD CONSTRAINT "service_scale_schedules_service_unit_id_fkey" FOREIGN KEY ("service_unit_id") REFERENCES "public"."event_service_units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_scale_slot_requirements"
    ADD CONSTRAINT "service_scale_slot_requirements_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."service_scale_schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_schedules"
    ADD CONSTRAINT "service_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shirt_images"
    ADD CONSTRAINT "shirt_images_shirt_id_fkey" FOREIGN KEY ("shirt_id") REFERENCES "public"."shirts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shirt_order_items"
    ADD CONSTRAINT "shirt_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."shirt_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shirt_order_items"
    ADD CONSTRAINT "shirt_order_items_shirt_id_fkey" FOREIGN KEY ("shirt_id") REFERENCES "public"."shirts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shirt_orders"
    ADD CONSTRAINT "shirt_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shirts"
    ADD CONSTRAINT "shirts_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_group_traffic"
    ADD CONSTRAINT "trail_group_traffic_destination_station_id_fkey" FOREIGN KEY ("destination_station_id") REFERENCES "public"."trail_map_stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_group_traffic"
    ADD CONSTRAINT "trail_group_traffic_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_group_traffic"
    ADD CONSTRAINT "trail_group_traffic_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."event_service_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_group_traffic_history"
    ADD CONSTRAINT "trail_group_traffic_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_group_traffic_history"
    ADD CONSTRAINT "trail_group_traffic_history_destination_station_id_fkey" FOREIGN KEY ("destination_station_id") REFERENCES "public"."trail_map_stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_group_traffic_history"
    ADD CONSTRAINT "trail_group_traffic_history_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_group_traffic_history"
    ADD CONSTRAINT "trail_group_traffic_history_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."event_service_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_group_traffic_history"
    ADD CONSTRAINT "trail_group_traffic_history_origin_station_id_fkey" FOREIGN KEY ("origin_station_id") REFERENCES "public"."trail_map_stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_group_traffic_history"
    ADD CONSTRAINT "trail_group_traffic_history_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."trail_map_stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_group_traffic_history"
    ADD CONSTRAINT "trail_group_traffic_history_traffic_id_fkey" FOREIGN KEY ("traffic_id") REFERENCES "public"."trail_group_traffic"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_group_traffic"
    ADD CONSTRAINT "trail_group_traffic_origin_station_id_fkey" FOREIGN KEY ("origin_station_id") REFERENCES "public"."trail_map_stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_group_traffic"
    ADD CONSTRAINT "trail_group_traffic_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."trail_map_stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_group_traffic"
    ADD CONSTRAINT "trail_group_traffic_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_map_connections"
    ADD CONSTRAINT "trail_map_connections_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_map_connections"
    ADD CONSTRAINT "trail_map_connections_from_fk" FOREIGN KEY ("edition_id", "from_station_id") REFERENCES "public"."trail_map_stations"("edition_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_map_connections"
    ADD CONSTRAINT "trail_map_connections_to_fk" FOREIGN KEY ("edition_id", "to_station_id") REFERENCES "public"."trail_map_stations"("edition_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_map_stations"
    ADD CONSTRAINT "trail_map_stations_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_map_stations"
    ADD CONSTRAINT "trail_map_stations_service_unit_id_fkey" FOREIGN KEY ("service_unit_id") REFERENCES "public"."event_service_units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_route_execution_steps"
    ADD CONSTRAINT "trail_route_execution_steps_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_route_execution_steps"
    ADD CONSTRAINT "trail_route_execution_steps_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "public"."trail_route_executions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_route_execution_steps"
    ADD CONSTRAINT "trail_route_execution_steps_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."event_service_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_route_execution_steps"
    ADD CONSTRAINT "trail_route_execution_steps_plan_step_id_fkey" FOREIGN KEY ("plan_step_id") REFERENCES "public"."trail_route_plan_steps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_route_execution_steps"
    ADD CONSTRAINT "trail_route_execution_steps_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."trail_map_stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_route_executions"
    ADD CONSTRAINT "trail_route_executions_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_route_executions"
    ADD CONSTRAINT "trail_route_executions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."event_service_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_route_executions"
    ADD CONSTRAINT "trail_route_executions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."trail_route_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_route_executions"
    ADD CONSTRAINT "trail_route_executions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_route_plan_steps"
    ADD CONSTRAINT "trail_route_plan_steps_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_route_plan_steps"
    ADD CONSTRAINT "trail_route_plan_steps_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."event_service_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_route_plan_steps"
    ADD CONSTRAINT "trail_route_plan_steps_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."trail_route_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_route_plan_steps"
    ADD CONSTRAINT "trail_route_plan_steps_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."trail_map_stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trail_route_plans"
    ADD CONSTRAINT "trail_route_plans_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "public"."forjados_editions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trail_route_plans"
    ADD CONSTRAINT "trail_route_plans_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."event_service_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."web_push_subscriptions"
    ADD CONSTRAINT "web_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Loja 2.0 - ver fotos de produtos ativos" ON "public"."points_store_product_images" FOR SELECT TO "authenticated" USING (("public"."forjados_is_admin_or_director"() OR (EXISTS ( SELECT 1
   FROM "public"."points_store_products" "p"
  WHERE (("p"."id" = "points_store_product_images"."product_id") AND ("p"."is_active" = true))))));



CREATE POLICY "Loja de Camisas 2.0 - ver fotos de camisas ativas" ON "public"."shirt_images" FOR SELECT TO "authenticated" USING (("public"."forjados_is_admin_or_director"() OR (EXISTS ( SELECT 1
   FROM "public"."shirts" "s"
  WHERE (("s"."id" = "shirt_images"."shirt_id") AND ("s"."is_active" = true))))));



ALTER TABLE "public"."account_deletion_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins can insert automated messages" ON "public"."automated_messages" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ((COALESCE("p"."is_admin", false) = true) OR (("p"."role")::"text" = ANY (ARRAY['admin'::"text", 'director'::"text"])) OR ("p"."email" = 'forjados.ofc@gmail.com'::"text"))))));



CREATE POLICY "admins can read automated messages" ON "public"."automated_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ((COALESCE("p"."is_admin", false) = true) OR (("p"."role")::"text" = ANY (ARRAY['admin'::"text", 'director'::"text"])) OR ("p"."email" = 'forjados.ofc@gmail.com'::"text"))))));



CREATE POLICY "admins can read participations" ON "public"."retreat_participations" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."forjados_can_manage_treasury_v1"()));



CREATE POLICY "admins can update automated messages" ON "public"."automated_messages" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ((COALESCE("p"."is_admin", false) = true) OR (("p"."role")::"text" = ANY (ARRAY['admin'::"text", 'director'::"text"])) OR ("p"."email" = 'forjados.ofc@gmail.com'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ((COALESCE("p"."is_admin", false) = true) OR (("p"."role")::"text" = ANY (ARRAY['admin'::"text", 'director'::"text"])) OR ("p"."email" = 'forjados.ofc@gmail.com'::"text"))))));



CREATE POLICY "admins can view push queue" ON "public"."push_notification_queue" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ((COALESCE("p"."is_admin", false) = true) OR (("p"."role")::"text" = ANY (ARRAY['admin'::"text", 'director'::"text"])))))));



ALTER TABLE "public"."app_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_select_managers" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND (("p"."is_admin" = true) OR (("p"."role")::"text" = ANY (ARRAY['admin'::"text", 'director'::"text"])))))));



ALTER TABLE "public"."automated_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chats_insert_authenticated" ON "public"."chats" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = ANY ("participants")));



CREATE POLICY "chats_select_participants" ON "public"."chats" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = ANY ("participants")) OR "public"."is_admin"()));



CREATE POLICY "chats_update_participants" ON "public"."chats" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = ANY ("participants")) OR "public"."is_admin"())) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = ANY ("participants")) OR "public"."is_admin"()));



ALTER TABLE "public"."edition_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_schedule_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_schedule_items_insert_manager" ON "public"."event_schedule_items" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("deleted_at" IS NULL)));



CREATE POLICY "event_schedule_items_select" ON "public"."event_schedule_items" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND (("is_published" = true) OR ( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"))));



CREATE POLICY "event_schedule_items_update_manager" ON "public"."event_schedule_items" FOR UPDATE TO "authenticated" USING (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1")) WITH CHECK (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



ALTER TABLE "public"."event_service_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_service_assignments_delete_managers" ON "public"."event_service_assignments" FOR DELETE TO "authenticated" USING (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_assignments"."unit_id") AS "forjados_can_manage_event_service_unit_v1"));



CREATE POLICY "event_service_assignments_insert_managers" ON "public"."event_service_assignments" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_assignments"."unit_id") AS "forjados_can_manage_event_service_unit_v1"));



CREATE POLICY "event_service_assignments_select_authenticated" ON "public"."event_service_assignments" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "event_service_assignments_update_managers" ON "public"."event_service_assignments" FOR UPDATE TO "authenticated" USING (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_assignments"."unit_id") AS "forjados_can_manage_event_service_unit_v1")) WITH CHECK (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_assignments"."unit_id") AS "forjados_can_manage_event_service_unit_v1"));



ALTER TABLE "public"."event_service_positions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_service_positions_delete_managers" ON "public"."event_service_positions" FOR DELETE TO "authenticated" USING (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_positions"."unit_id") AS "forjados_can_manage_event_service_unit_v1"));



CREATE POLICY "event_service_positions_insert_managers" ON "public"."event_service_positions" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_positions"."unit_id") AS "forjados_can_manage_event_service_unit_v1"));



CREATE POLICY "event_service_positions_select_authenticated" ON "public"."event_service_positions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "event_service_positions_update_managers" ON "public"."event_service_positions" FOR UPDATE TO "authenticated" USING (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_positions"."unit_id") AS "forjados_can_manage_event_service_unit_v1")) WITH CHECK (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_positions"."unit_id") AS "forjados_can_manage_event_service_unit_v1"));



ALTER TABLE "public"."event_service_slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_service_slots_delete_managers" ON "public"."event_service_slots" FOR DELETE TO "authenticated" USING (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_slots"."unit_id") AS "forjados_can_manage_event_service_unit_v1"));



CREATE POLICY "event_service_slots_insert_managers" ON "public"."event_service_slots" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_slots"."unit_id") AS "forjados_can_manage_event_service_unit_v1"));



CREATE POLICY "event_service_slots_select_authenticated" ON "public"."event_service_slots" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "event_service_slots_update_managers" ON "public"."event_service_slots" FOR UPDATE TO "authenticated" USING (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_slots"."unit_id") AS "forjados_can_manage_event_service_unit_v1")) WITH CHECK (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_slots"."unit_id") AS "forjados_can_manage_event_service_unit_v1"));



ALTER TABLE "public"."event_service_units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_service_units_delete_managers" ON "public"."event_service_units" FOR DELETE TO "authenticated" USING (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



CREATE POLICY "event_service_units_insert_managers" ON "public"."event_service_units" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



CREATE POLICY "event_service_units_select_authenticated" ON "public"."event_service_units" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "event_service_units_update_managers" ON "public"."event_service_units" FOR UPDATE TO "authenticated" USING (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_units"."id") AS "forjados_can_manage_event_service_unit_v1")) WITH CHECK (( SELECT "private"."forjados_can_manage_event_service_unit_v1"("event_service_units"."id") AS "forjados_can_manage_event_service_unit_v1"));



CREATE POLICY "everyone can read active event" ON "public"."retreat_events" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "forjados_2_1r2_service_scale_assignments_delete_manager" ON "public"."service_scale_assignments" FOR DELETE TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r2_service_scale_assignments_insert_manager" ON "public"."service_scale_assignments" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r2_service_scale_assignments_select_manager" ON "public"."service_scale_assignments" FOR SELECT TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r2_service_scale_assignments_update_manager" ON "public"."service_scale_assignments" FOR UPDATE TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale")) WITH CHECK (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r2_service_scale_people_delete_manager" ON "public"."service_scale_people" FOR DELETE TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r2_service_scale_people_insert_manager" ON "public"."service_scale_people" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r2_service_scale_people_select_manager" ON "public"."service_scale_people" FOR SELECT TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r2_service_scale_people_update_manager" ON "public"."service_scale_people" FOR UPDATE TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale")) WITH CHECK (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r2_service_scale_schedules_delete_manager" ON "public"."service_scale_schedules" FOR DELETE TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r2_service_scale_schedules_insert_manager" ON "public"."service_scale_schedules" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r2_service_scale_schedules_select_manager" ON "public"."service_scale_schedules" FOR SELECT TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r2_service_scale_schedules_update_manager" ON "public"."service_scale_schedules" FOR UPDATE TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale")) WITH CHECK (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_2_1r_editions_select" ON "public"."forjados_editions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "forjados_2_1r_enrollments_select" ON "public"."edition_enrollments" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text", 'treasury'::"text"]) AS "forjados_has_any_role_v1")));



CREATE POLICY "forjados_2_1r_offers_select" ON "public"."offers" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text", 'treasury'::"text"]) AS "forjados_has_any_role_v1")));



CREATE POLICY "forjados_2_1r_profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "forjados_2_1r_receipts_select" ON "public"."payment_receipts" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text", 'treasury'::"text"]) AS "forjados_has_any_role_v1")));



CREATE POLICY "forjados_2_1r_shirt_order_items_select" ON "public"."shirt_order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."shirt_orders" "orders"
  WHERE (("orders"."id" = "shirt_order_items"."order_id") AND (("orders"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text", 'treasury'::"text"]) AS "forjados_has_any_role_v1"))))));



CREATE POLICY "forjados_2_1r_shirt_orders_select" ON "public"."shirt_orders" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text", 'treasury'::"text"]) AS "forjados_has_any_role_v1")));



ALTER TABLE "public"."forjados_editions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forjados_service_scale_slot_requirements_delete_manager" ON "public"."service_scale_slot_requirements" FOR DELETE TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_service_scale_slot_requirements_insert_manager" ON "public"."service_scale_slot_requirements" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_service_scale_slot_requirements_select_manager" ON "public"."service_scale_slot_requirements" FOR SELECT TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



CREATE POLICY "forjados_service_scale_slot_requirements_update_manager" ON "public"."service_scale_slot_requirements" FOR UPDATE TO "authenticated" USING (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale")) WITH CHECK (( SELECT "public"."can_manage_service_scale"() AS "can_manage_service_scale"));



ALTER TABLE "public"."honor_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "honor_goals_select_own" ON "public"."honor_goals" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."internal_runtime_secrets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "logs_insert_authenticated" ON "public"."system_logs" FOR INSERT TO "authenticated";



CREATE POLICY "logs_select_admin" ON "public"."system_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."material_item_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "material_item_history_select_managers" ON "public"."material_item_history" FOR SELECT TO "authenticated" USING (( SELECT "private"."forjados_can_manage_material_sector_v1"("material_item_history"."edition_id", "material_item_history"."sector_unit_id") AS "forjados_can_manage_material_sector_v1"));



ALTER TABLE "public"."material_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "material_items_insert_managers" ON "public"."material_items" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."forjados_can_manage_material_sector_v1"("material_items"."edition_id", "material_items"."sector_unit_id") AS "forjados_can_manage_material_sector_v1") AND ("is_archived" IS FALSE)));



CREATE POLICY "material_items_select_managers" ON "public"."material_items" FOR SELECT TO "authenticated" USING (( SELECT "private"."forjados_can_manage_material_sector_v1"("material_items"."edition_id", "material_items"."sector_unit_id") AS "forjados_can_manage_material_sector_v1"));



CREATE POLICY "material_items_update_managers" ON "public"."material_items" FOR UPDATE TO "authenticated" USING (( SELECT "private"."forjados_can_manage_material_sector_v1"("material_items"."edition_id", "material_items"."sector_unit_id") AS "forjados_can_manage_material_sector_v1")) WITH CHECK (( SELECT "private"."forjados_can_manage_material_sector_v1"("material_items"."edition_id", "material_items"."sector_unit_id") AS "forjados_can_manage_material_sector_v1"));



ALTER TABLE "public"."material_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "material_movements_select_managers" ON "public"."material_movements" FOR SELECT TO "authenticated" USING (( SELECT "private"."forjados_can_manage_material_sector_v1"("material_movements"."edition_id", "material_movements"."sector_unit_id") AS "forjados_can_manage_material_sector_v1"));



CREATE POLICY "messages_insert_sender" ON "public"."chat_messages" FOR INSERT TO "authenticated" WITH CHECK (("sender_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "messages_select_participants" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "chat_messages"."chat_id") AND ((( SELECT "auth"."uid"() AS "uid") = ANY ("c"."participants")) OR "public"."is_admin"())))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_insert_manager" ON "public"."app_notifications" FOR INSERT TO "authenticated" WITH CHECK ("public"."current_user_can_manage"());



CREATE POLICY "notifications_select_own" ON "public"."app_notifications" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"()));



CREATE POLICY "notifications_update_own" ON "public"."app_notifications" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."offers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."point_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."points_redemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "points_redemptions_select" ON "public"."points_redemptions" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"() OR "public"."is_director_or_admin"()));



CREATE POLICY "points_redemptions_update_admin_director" ON "public"."points_redemptions" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR "public"."is_director_or_admin"())) WITH CHECK (("public"."is_admin"() OR "public"."is_director_or_admin"()));



CREATE POLICY "points_select" ON "public"."point_transactions" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"() OR "public"."is_director_or_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'leader'::"public"."user_role"))))));



ALTER TABLE "public"."points_store_product_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "points_store_product_images_delete_manager" ON "public"."points_store_product_images" FOR DELETE TO "authenticated" USING ("public"."forjados_is_admin_or_director"());



CREATE POLICY "points_store_product_images_insert_manager" ON "public"."points_store_product_images" FOR INSERT TO "authenticated" WITH CHECK ("public"."forjados_is_admin_or_director"());



CREATE POLICY "points_store_product_images_update_manager" ON "public"."points_store_product_images" FOR UPDATE TO "authenticated" USING ("public"."forjados_is_admin_or_director"()) WITH CHECK ("public"."forjados_is_admin_or_director"());



ALTER TABLE "public"."points_store_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "points_store_products_delete_manager" ON "public"."points_store_products" FOR DELETE TO "authenticated" USING ("public"."current_user_can_manage"());



CREATE POLICY "points_store_products_insert_manager" ON "public"."points_store_products" FOR INSERT TO "authenticated" WITH CHECK ("public"."current_user_can_manage"());



CREATE POLICY "points_store_products_select_authenticated" ON "public"."points_store_products" FOR SELECT TO "authenticated" USING (("deleted_at" IS NULL));



CREATE POLICY "points_store_products_update_manager" ON "public"."points_store_products" FOR UPDATE TO "authenticated" USING ("public"."current_user_can_manage"()) WITH CHECK ("public"."current_user_can_manage"());



ALTER TABLE "public"."product_redemptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_delete_manager" ON "public"."products" FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR "public"."is_director_or_admin"()));



CREATE POLICY "products_insert_manager" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR "public"."is_director_or_admin"()));



CREATE POLICY "products_select" ON "public"."products" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "products_update_manager" ON "public"."products" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR "public"."is_director_or_admin"())) WITH CHECK (("public"."is_admin"() OR "public"."is_director_or_admin"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_panel_delete_manager" ON "public"."public_panel_items" FOR DELETE TO "authenticated" USING ("public"."current_user_can_manage"());



CREATE POLICY "public_panel_insert_manager" ON "public"."public_panel_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."current_user_can_manage"());



ALTER TABLE "public"."public_panel_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_panel_select_active" ON "public"."public_panel_items" FOR SELECT TO "authenticated" USING (((("is_active" = true) AND ("deleted_at" IS NULL)) OR "public"."current_user_can_manage"()));



CREATE POLICY "public_panel_update_manager" ON "public"."public_panel_items" FOR UPDATE TO "authenticated" USING ("public"."current_user_can_manage"()) WITH CHECK ("public"."current_user_can_manage"());



ALTER TABLE "public"."push_notification_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "redemptions_select" ON "public"."product_redemptions" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"() OR "public"."is_director_or_admin"()));



CREATE POLICY "redemptions_update_admin_director" ON "public"."product_redemptions" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR "public"."is_director_or_admin"())) WITH CHECK (("public"."is_admin"() OR "public"."is_director_or_admin"()));



ALTER TABLE "public"."retreat_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retreat_events_delete_manager" ON "public"."retreat_events" FOR DELETE TO "authenticated" USING ("public"."forjados_is_admin_v5"());



CREATE POLICY "retreat_events_insert_manager" ON "public"."retreat_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."forjados_is_admin_v5"());



CREATE POLICY "retreat_events_update_manager" ON "public"."retreat_events" FOR UPDATE TO "authenticated" USING ("public"."forjados_is_admin_v5"()) WITH CHECK ("public"."forjados_is_admin_v5"());



ALTER TABLE "public"."retreat_participations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_passengers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ride_passengers_delete_own" ON "public"."ride_passengers" FOR DELETE TO "authenticated" USING (("passenger_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "ride_passengers_insert_own" ON "public"."ride_passengers" FOR INSERT TO "authenticated" WITH CHECK (("passenger_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "ride_passengers_select" ON "public"."ride_passengers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ride_passengers_update_driver_or_director" ON "public"."ride_passengers" FOR UPDATE TO "authenticated" USING ((("passenger_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"() OR "public"."is_director_or_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."rides" "r"
  WHERE (("r"."id" = "ride_passengers"."ride_id") AND ("r"."driver_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK ((("passenger_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"() OR "public"."is_director_or_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."rides" "r"
  WHERE (("r"."id" = "ride_passengers"."ride_id") AND ("r"."driver_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."ride_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ride_settings_select_authenticated" ON "public"."ride_settings" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



ALTER TABLE "public"."rides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rides_insert_own" ON "public"."rides" FOR INSERT TO "authenticated" WITH CHECK (("driver_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "rides_select" ON "public"."rides" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rides_update_driver_or_director" ON "public"."rides" FOR UPDATE TO "authenticated" USING ((("driver_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"() OR "public"."is_director_or_admin"())) WITH CHECK ((("driver_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"() OR "public"."is_director_or_admin"()));



ALTER TABLE "public"."service_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_assignments_delete_manager" ON "public"."service_assignments" FOR DELETE TO "authenticated" USING ("public"."can_manage_service_scale"());



CREATE POLICY "service_assignments_insert_manager" ON "public"."service_assignments" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_service_scale"());



CREATE POLICY "service_assignments_select_authenticated" ON "public"."service_assignments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "service_assignments_update_manager" ON "public"."service_assignments" FOR UPDATE TO "authenticated" USING ("public"."can_manage_service_scale"()) WITH CHECK ("public"."can_manage_service_scale"());



ALTER TABLE "public"."service_people" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_people_delete_manager" ON "public"."service_people" FOR DELETE TO "authenticated" USING ("public"."can_manage_service_scale"());



CREATE POLICY "service_people_insert_manager" ON "public"."service_people" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_service_scale"());



CREATE POLICY "service_people_select_authenticated" ON "public"."service_people" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "service_people_update_manager" ON "public"."service_people" FOR UPDATE TO "authenticated" USING ("public"."can_manage_service_scale"()) WITH CHECK ("public"."can_manage_service_scale"());



ALTER TABLE "public"."service_scale_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_scale_people" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_scale_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_scale_slot_requirements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_schedules_delete_manager" ON "public"."service_schedules" FOR DELETE TO "authenticated" USING ("public"."can_manage_service_scale"());



CREATE POLICY "service_schedules_insert_manager" ON "public"."service_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_service_scale"());



CREATE POLICY "service_schedules_select_authenticated" ON "public"."service_schedules" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "service_schedules_update_manager" ON "public"."service_schedules" FOR UPDATE TO "authenticated" USING ("public"."can_manage_service_scale"()) WITH CHECK ("public"."can_manage_service_scale"());



ALTER TABLE "public"."shirt_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shirt_images_delete_manager" ON "public"."shirt_images" FOR DELETE TO "authenticated" USING ("public"."forjados_is_admin_or_director"());



CREATE POLICY "shirt_images_insert_manager" ON "public"."shirt_images" FOR INSERT TO "authenticated" WITH CHECK ("public"."forjados_is_admin_or_director"());



CREATE POLICY "shirt_images_update_manager" ON "public"."shirt_images" FOR UPDATE TO "authenticated" USING ("public"."forjados_is_admin_or_director"()) WITH CHECK ("public"."forjados_is_admin_or_director"());



ALTER TABLE "public"."shirt_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shirt_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shirts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shirts_delete_manager" ON "public"."shirts" FOR DELETE TO "authenticated" USING ("public"."current_user_can_manage"());



CREATE POLICY "shirts_insert_manager" ON "public"."shirts" FOR INSERT TO "authenticated" WITH CHECK ("public"."current_user_can_manage"());



CREATE POLICY "shirts_select_authenticated" ON "public"."shirts" FOR SELECT TO "authenticated" USING (("deleted_at" IS NULL));



CREATE POLICY "shirts_update_manager" ON "public"."shirts" FOR UPDATE TO "authenticated" USING ("public"."current_user_can_manage"()) WITH CHECK ("public"."current_user_can_manage"());



ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trail_group_traffic" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trail_group_traffic_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trail_group_traffic_history_select_managers" ON "public"."trail_group_traffic_history" FOR SELECT TO "authenticated" USING (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



CREATE POLICY "trail_group_traffic_insert_managers" ON "public"."trail_group_traffic" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



CREATE POLICY "trail_group_traffic_select_managers" ON "public"."trail_group_traffic" FOR SELECT TO "authenticated" USING (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



CREATE POLICY "trail_group_traffic_update_managers" ON "public"."trail_group_traffic" FOR UPDATE TO "authenticated" USING (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1")) WITH CHECK (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



ALTER TABLE "public"."trail_map_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trail_map_connections_select_managers" ON "public"."trail_map_connections" FOR SELECT TO "authenticated" USING (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



ALTER TABLE "public"."trail_map_stations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trail_map_stations_select_managers" ON "public"."trail_map_stations" FOR SELECT TO "authenticated" USING (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



ALTER TABLE "public"."trail_route_execution_steps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trail_route_execution_steps_manage_admin_director" ON "public"."trail_route_execution_steps" TO "authenticated" USING (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1")) WITH CHECK (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



ALTER TABLE "public"."trail_route_executions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trail_route_executions_manage_admin_director" ON "public"."trail_route_executions" TO "authenticated" USING (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1")) WITH CHECK (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



ALTER TABLE "public"."trail_route_plan_steps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trail_route_plan_steps_manage_admin_director" ON "public"."trail_route_plan_steps" TO "authenticated" USING (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1")) WITH CHECK (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



ALTER TABLE "public"."trail_route_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trail_route_plans_manage_admin_director" ON "public"."trail_route_plans" TO "authenticated" USING (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1")) WITH CHECK (( SELECT "private"."forjados_has_any_role_v1"(ARRAY['admin'::"text", 'director'::"text"]) AS "forjados_has_any_role_v1"));



CREATE POLICY "users can create own push subscriptions" ON "public"."web_push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users can update own push subscriptions" ON "public"."web_push_subscriptions" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users can view own push subscriptions" ON "public"."web_push_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."web_push_subscriptions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."forjados_audit_event_service_change_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_audit_material_item_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_can_access_material_image_v1"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."forjados_can_access_material_image_v1"("p_name" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."forjados_can_manage_event_service_unit_v1"("p_unit_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."forjados_can_manage_event_service_unit_v1"("p_unit_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."forjados_can_manage_material_sector_v1"("p_edition_id" "uuid", "p_sector_unit_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."forjados_can_manage_material_sector_v1"("p_edition_id" "uuid", "p_sector_unit_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."forjados_clear_previous_primary_sector_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_handle_schedule_change_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_has_any_role_v1"("p_roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."forjados_has_any_role_v1"("p_roles" "text"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "private"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "private"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."forjados_notify_management_on_action_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_prepare_event_service_assignment_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_prepare_event_service_slot_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_prepare_material_item_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_prepare_trail_group_traffic_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_record_trail_group_traffic_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_refresh_profile_sectors_v1"("p_user_id" "uuid", "p_edition_id" "uuid") FROM PUBLIC;



GRANT ALL ON TABLE "public"."material_movements" TO "service_role";
GRANT SELECT ON TABLE "public"."material_movements" TO "authenticated";



REVOKE ALL ON FUNCTION "private"."forjados_register_material_movement_v1"("p_item_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_borrower" "text", "p_due_date" "date", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."forjados_register_material_movement_v1"("p_item_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_borrower" "text", "p_due_date" "date", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."forjados_run_automation_tick_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."forjados_run_automation_tick_v1"() TO "service_role";



GRANT ALL ON TABLE "public"."service_scale_schedules" TO "anon";
GRANT ALL ON TABLE "public"."service_scale_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."service_scale_schedules" TO "service_role";



REVOKE ALL ON FUNCTION "private"."forjados_save_service_scale_v3"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."forjados_save_service_scale_v3"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "private"."forjados_save_service_scale_v3"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."forjados_seed_event_services_on_edition_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_seed_event_services_v1"("p_edition_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_seed_trail_route_plan_on_group_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_seed_trail_route_plans_v1"("p_edition_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_seed_trail_traffic_on_edition_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_seed_trail_traffic_on_group_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_seed_trail_traffic_v1"("p_edition_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_set_notification_read_at_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_stamp_trail_route_execution_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_sync_profile_sectors_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_validate_trail_route_plan_step_v1"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."forjados_validate_trail_route_plan_v1"() FROM PUBLIC;



GRANT SELECT,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_approve_profile"("p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_approve_profile"("p_user_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_dashboard_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_dashboard_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_dashboard_summary"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_pending_access_requests"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_pending_access_requests"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_profiles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_profiles"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_reject_profile"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_reject_profile"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_profile"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_profile"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_service_scale"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_service_scale"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_service_scale"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_ride_completion"("p_ride_id" "uuid", "p_completed" boolean, "p_confirmed_passenger_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_ride_completion"("p_ride_id" "uuid", "p_completed" boolean, "p_confirmed_passenger_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_ride_completion"("p_ride_id" "uuid", "p_completed" boolean, "p_confirmed_passenger_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_audit_log"("p_action" "text", "p_entity_type" "text", "p_entity_id" "text", "p_description" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_audit_log"("p_action" "text", "p_entity_type" "text", "p_entity_id" "text", "p_description" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_can_manage"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_can_manage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_can_manage"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_can_manage_finance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_can_manage_finance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_can_manage_finance"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_can_manage_points"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_can_manage_points"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_can_manage_points"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_can_view_profile"("target_user_id" "uuid", "target_sectors" "text"[], "target_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_can_view_profile"("target_user_id" "uuid", "target_sectors" "text"[], "target_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_can_view_profile"("target_user_id" "uuid", "target_sectors" "text"[], "target_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_my_active_edition_enrollment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_my_active_edition_enrollment"() TO "service_role";
GRANT ALL ON FUNCTION "public"."ensure_my_active_edition_enrollment"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ensure_service_scale_person"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_service_scale_person"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_approve_profile_v3"("p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_approve_profile_v3"("p_user_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_approve_profile_v4"("p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_approve_profile_v4"("p_user_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_approve_profile_v5"("p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_approve_profile_v5"("p_user_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_admin_approve_profile_v5"("p_user_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_delete_profile_v6"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_delete_profile_v6"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_admin_delete_profile_v6"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_is_authorized_v4"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_is_authorized_v4"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_list_pending_access_requests_v3"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_list_pending_access_requests_v3"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_list_pending_access_requests_v4"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_list_pending_access_requests_v4"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_list_pending_access_requests_v5"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_list_pending_access_requests_v5"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_admin_list_pending_access_requests_v5"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_list_profiles_v3"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_list_profiles_v3"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_list_profiles_v4"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_list_profiles_v4"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_list_profiles_v5"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_list_profiles_v5"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_admin_list_profiles_v5"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_reject_profile_v3"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_reject_profile_v3"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_reject_profile_v4"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_reject_profile_v4"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_reject_profile_v5"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_reject_profile_v5"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_admin_reject_profile_v5"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_soft_delete_record_v1"("p_entity_type" "text", "p_entity_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_soft_delete_record_v1"("p_entity_type" "text", "p_entity_id" "uuid", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_admin_soft_delete_record_v1"("p_entity_type" "text", "p_entity_id" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_admin_update_member_since_v1"("p_user_id" "uuid", "p_member_since" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_update_member_since_v1"("p_user_id" "uuid", "p_member_since" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_admin_update_member_since_v1"("p_user_id" "uuid", "p_member_since" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_admin_update_profile_v3"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_update_profile_v3"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_update_profile_v4"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_update_profile_v4"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_update_profile_v5"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_update_profile_v5"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_admin_update_profile_v5"("p_user_id" "uuid", "p_role" "text", "p_requested_role" "text", "p_inscription_status" "text", "p_sectors" "text"[], "p_primary_team" "text", "p_display_name" "text", "p_phone" "text", "p_city" "text", "p_neighborhood" "text", "p_internal_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_admin_update_retreat_count_v6"("p_user_id" "uuid", "p_retreat_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_admin_update_retreat_count_v6"("p_user_id" "uuid", "p_retreat_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_admin_update_retreat_count_v6"("p_user_id" "uuid", "p_retreat_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_assign_member_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_assign_member_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_automated_messages_cron_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_automated_messages_cron_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_automated_messages_cron_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_can_manage_automation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_can_manage_automation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_can_manage_automation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_can_manage_treasury_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_can_manage_treasury_v1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_can_manage_treasury_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_check_in_trail_step_v1"("p_execution_step_id" "uuid", "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_check_in_trail_step_v1"("p_execution_step_id" "uuid", "p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_check_in_trail_step_v1"("p_execution_step_id" "uuid", "p_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_claim_push_queue"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_claim_push_queue"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_clear_my_honor_goal_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_clear_my_honor_goal_v1"() TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_clear_my_honor_goal_v1"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_clear_my_notification_history_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_clear_my_notification_history_v1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_clear_my_notification_history_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_clear_notification_receipts_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_clear_notification_receipts_v1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_clear_notification_receipts_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_configure_push_cron"("p_function_url" "text", "p_frequency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_configure_push_cron"("p_function_url" "text", "p_frequency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_configure_push_cron"("p_function_url" "text", "p_frequency" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_confirm_participation_from_payment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_confirm_participation_from_payment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_create_offer_v1"("p_amount" numeric, "p_method" "text", "p_objective" "text", "p_notes" "text", "p_proof_path" "text", "p_user_name" "text", "p_user_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_create_offer_v1"("p_amount" numeric, "p_method" "text", "p_objective" "text", "p_notes" "text", "p_proof_path" "text", "p_user_name" "text", "p_user_email" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_create_offer_v1"("p_amount" numeric, "p_method" "text", "p_objective" "text", "p_notes" "text", "p_proof_path" "text", "p_user_name" "text", "p_user_email" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_create_shirt_order_v1"("p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_create_shirt_order_v1"("p_items" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_create_shirt_order_v1"("p_items" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_current_user_can_manage_v3"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_current_user_can_manage_v3"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_ensure_my_profile_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_ensure_my_profile_v1"() TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_ensure_my_profile_v1"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_finish_account_deletion_v1"("p_receipt_id" "uuid", "p_success" boolean, "p_failure_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_finish_account_deletion_v1"("p_receipt_id" "uuid", "p_success" boolean, "p_failure_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_finish_trail_route_v1"("p_group_id" "uuid", "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_finish_trail_route_v1"("p_group_id" "uuid", "p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_finish_trail_route_v1"("p_group_id" "uuid", "p_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_get_my_inscription_overview_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_get_my_inscription_overview_v1"() TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_get_my_inscription_overview_v1"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_is_admin_or_director"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_is_admin_or_director"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_is_admin_or_director"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_is_admin_v5"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_is_admin_v5"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_is_admin_v5"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_list_attendance_v1"("p_edition_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_list_attendance_v1"("p_edition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_list_attendance_v1"("p_edition_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_list_attendance_v2"("p_edition_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_list_attendance_v2"("p_edition_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_list_attendance_v2"("p_edition_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_list_material_editions_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_list_material_editions_v1"() TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_list_material_editions_v1"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_list_material_sectors_v1"("p_edition_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_list_material_sectors_v1"("p_edition_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_list_material_sectors_v1"("p_edition_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_list_notification_receipts_v1"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_list_notification_receipts_v1"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_list_notification_receipts_v1"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_list_published_service_scales_v1"("p_edition_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_list_retreat_birthdays_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_list_retreat_birthdays_v1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_list_retreat_birthdays_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_list_schedule_people_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_list_schedule_people_v1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_list_schedule_people_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_list_service_people_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_list_service_people_v1"() TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_list_service_people_v1"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_mark_all_my_notifications_read_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_mark_all_my_notifications_read_v1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_mark_all_my_notifications_read_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_mark_my_notification_v1"("p_notification_id" "uuid", "p_is_read" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_mark_my_notification_v1"("p_notification_id" "uuid", "p_is_read" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_mark_my_notification_v1"("p_notification_id" "uuid", "p_is_read" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_notify_new_store_item_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_notify_new_store_item_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_prepare_account_deletion_v1"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_prepare_account_deletion_v1"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_prepare_ride_points_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_prepare_ride_points_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_process_due_automated_messages"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_process_due_automated_messages"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_protect_profile_member_since_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_protect_profile_member_since_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_purge_expired_account_deletion_receipts_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_purge_expired_account_deletion_receipts_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_push_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_push_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_push_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_queue_push_from_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_queue_push_from_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_register_material_movement_v1"("p_item_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_borrower" "text", "p_due_date" "date", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_register_material_movement_v1"("p_item_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_borrower" "text", "p_due_date" "date", "p_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_register_material_movement_v1"("p_item_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_borrower" "text", "p_due_date" "date", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_register_push_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_register_push_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_register_push_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_reorder_trail_execution_v1"("p_execution_id" "uuid", "p_step_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_reorder_trail_execution_v1"("p_execution_id" "uuid", "p_step_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_reorder_trail_execution_v1"("p_execution_id" "uuid", "p_step_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_reorder_trail_route_plan_v1"("p_plan_id" "uuid", "p_step_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_reorder_trail_route_plan_v1"("p_plan_id" "uuid", "p_step_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_reorder_trail_route_plan_v1"("p_plan_id" "uuid", "p_step_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_reset_trail_routes_v1"("p_edition_id" "uuid", "p_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_reset_trail_routes_v1"("p_edition_id" "uuid", "p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_reset_trail_routes_v1"("p_edition_id" "uuid", "p_group_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_review_offer_v1"("p_offer_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_review_offer_v1"("p_offer_id" "uuid", "p_status" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_review_offer_v1"("p_offer_id" "uuid", "p_status" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_review_payment_receipt_v1"("p_receipt_id" "uuid", "p_status" "text", "p_observations" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_review_payment_receipt_v1"("p_receipt_id" "uuid", "p_status" "text", "p_observations" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_review_payment_receipt_v1"("p_receipt_id" "uuid", "p_status" "text", "p_observations" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_review_shirt_order_v1"("p_order_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_review_shirt_order_v1"("p_order_id" "uuid", "p_status" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_review_shirt_order_v1"("p_order_id" "uuid", "p_status" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_save_active_edition_v2"("p_title" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_location" "text", "p_registration_amount" numeric, "p_registration_open" boolean, "p_create_new" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_save_active_edition_v2"("p_title" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_location" "text", "p_registration_amount" numeric, "p_registration_open" boolean, "p_create_new" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_save_active_edition_v2"("p_title" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_location" "text", "p_registration_amount" numeric, "p_registration_open" boolean, "p_create_new" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_save_event_route_v1"("p_edition_id" "uuid", "p_start_at" timestamp with time zone, "p_rows" "jsonb", "p_is_published" boolean, "p_replace" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_save_event_route_v1"("p_edition_id" "uuid", "p_start_at" timestamp with time zone, "p_rows" "jsonb", "p_is_published" boolean, "p_replace" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_save_event_route_v1"("p_edition_id" "uuid", "p_start_at" timestamp with time zone, "p_rows" "jsonb", "p_is_published" boolean, "p_replace" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_save_service_scale_v1"("p_config" "jsonb", "p_assignments" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_save_service_scale_v1"("p_config" "jsonb", "p_assignments" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_save_service_scale_v1"("p_config" "jsonb", "p_assignments" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_save_service_scale_v2"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_save_service_scale_v2"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_save_service_scale_v2"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_save_service_scale_v3"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_save_service_scale_v3"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_save_service_scale_v3"("p_config" "jsonb", "p_slots" "jsonb", "p_assignments" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_scrub_account_references_v1"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_scrub_account_references_v1"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_send_test_push_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_send_test_push_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_send_test_push_notification"() TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."edition_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."edition_enrollments" TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_set_active_edition_participation_v1"("p_will_participate" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_set_active_edition_participation_v1"("p_will_participate" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_set_active_edition_participation_v1"("p_will_participate" boolean) TO "authenticated";



GRANT ALL ON TABLE "public"."honor_goals" TO "service_role";
GRANT SELECT ON TABLE "public"."honor_goals" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_set_my_honor_goal_v1"("p_goal_type" "text", "p_title" "text", "p_target_points" integer, "p_product_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_set_my_honor_goal_v1"("p_goal_type" "text", "p_title" "text", "p_target_points" integer, "p_product_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_set_my_honor_goal_v1"("p_goal_type" "text", "p_title" "text", "p_target_points" integer, "p_product_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_start_trail_route_v1"("p_group_id" "uuid", "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_start_trail_route_v1"("p_group_id" "uuid", "p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_start_trail_route_v1"("p_group_id" "uuid", "p_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_submit_inscription_receipt_v1"("p_file_path" "text", "p_file_name" "text", "p_file_type" "text", "p_user_name" "text", "p_user_email" "text", "p_user_whatsapp" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_submit_inscription_receipt_v1"("p_file_path" "text", "p_file_name" "text", "p_file_type" "text", "p_user_name" "text", "p_user_email" "text", "p_user_whatsapp" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_submit_inscription_receipt_v1"("p_file_path" "text", "p_file_name" "text", "p_file_type" "text", "p_user_name" "text", "p_user_email" "text", "p_user_whatsapp" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_submit_shirt_order_receipt_v1"("p_order_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_file_type" "text", "p_user_name" "text", "p_user_email" "text", "p_user_whatsapp" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_submit_shirt_order_receipt_v1"("p_order_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_file_type" "text", "p_user_name" "text", "p_user_email" "text", "p_user_whatsapp" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_submit_shirt_order_receipt_v1"("p_order_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_file_type" "text", "p_user_name" "text", "p_user_email" "text", "p_user_whatsapp" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_sync_service_scale_profiles_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_sync_service_scale_profiles_v1"() TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_sync_service_scale_profiles_v1"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_toggle_my_notification_pin_v1"("p_notification_id" "uuid", "p_is_pinned" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_toggle_my_notification_pin_v1"("p_notification_id" "uuid", "p_is_pinned" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_toggle_my_notification_pin_v1"("p_notification_id" "uuid", "p_is_pinned" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_update_attendance_v1"("p_participation_id" "uuid", "p_attendance_status" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_update_attendance_v1"("p_participation_id" "uuid", "p_attendance_status" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_update_attendance_v1"("p_participation_id" "uuid", "p_attendance_status" "text", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_update_attendance_v2"("p_user_id" "uuid", "p_edition_id" "uuid", "p_attendance_status" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_update_attendance_v2"("p_user_id" "uuid", "p_edition_id" "uuid", "p_attendance_status" "text", "p_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_update_attendance_v2"("p_user_id" "uuid", "p_edition_id" "uuid", "p_attendance_status" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_update_my_profile_v1"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_update_my_profile_v1"("p_payload" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_update_my_profile_v1"("p_payload" "jsonb") TO "authenticated";



GRANT ALL ON TABLE "public"."ride_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."ride_settings" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forjados_update_ride_settings_v1"("p_points_mode" "text", "p_points_per_passenger" integer, "p_fixed_points" integer, "p_event_address" "text", "p_event_map_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_update_ride_settings_v1"("p_points_mode" "text", "p_points_per_passenger" integer, "p_fixed_points" integer, "p_event_address" "text", "p_event_map_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."forjados_update_ride_settings_v1"("p_points_mode" "text", "p_points_per_passenger" integer, "p_fixed_points" integer, "p_event_address" "text", "p_event_map_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."forjados_upsert_active_edition_v1"("p_title" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_location" "text", "p_registration_amount" numeric, "p_registration_open" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forjados_upsert_active_edition_v1"("p_title" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_location" "text", "p_registration_amount" numeric, "p_registration_open" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."forjados_upsert_active_edition_v1"("p_title" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_location" "text", "p_registration_amount" numeric, "p_registration_open" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_actor_email"("p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_actor_email"("p_actor" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_actor_name"("p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_actor_name"("p_actor" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_active_edition_enrollment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_active_edition_enrollment"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_active_edition_enrollment"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."grant_points_manual"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_points_manual"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_points_manual"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_payment_receipt_review_notify"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_payment_receipt_review_notify"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_point_transaction_notify"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_point_transaction_notify"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_profile_approved_for_scale"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_profile_approved_for_scale"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_profile_status_notify"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_profile_status_notify"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_public_panel_notify"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_public_panel_notify"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_director_or_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_director_or_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_director_or_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_treasury_or_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_treasury_or_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_treasury_or_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_ride_atomic"("p_ride_id" "uuid", "p_passenger_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_ride_atomic"("p_ride_id" "uuid", "p_passenger_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_ride_atomic"("p_ride_id" "uuid", "p_passenger_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."leave_ride_atomic"("p_ride_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_ride_atomic"("p_ride_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_ride_atomic"("p_ride_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_my_team_members"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_my_team_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_my_team_members"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."points_list_eligible_profiles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."points_list_eligible_profiles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."points_list_eligible_profiles"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."points_list_ranking"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."points_list_ranking"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."points_list_ranking"() TO "service_role";



GRANT ALL ON TABLE "public"."point_transactions" TO "anon";
GRANT ALL ON TABLE "public"."point_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."point_transactions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."points_list_transactions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."points_list_transactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."points_list_transactions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_points_product"("p_product_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_points_product"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_points_product"("p_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_service_scale_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_service_scale_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_service_scale_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."account_deletion_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."app_notifications" TO "anon";
GRANT ALL ON TABLE "public"."app_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."app_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."automated_messages" TO "anon";
GRANT ALL ON TABLE "public"."automated_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."automated_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON TABLE "public"."event_schedule_items" TO "authenticated";
GRANT ALL ON TABLE "public"."event_schedule_items" TO "service_role";



GRANT ALL ON TABLE "public"."event_service_assignments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_service_assignments" TO "authenticated";



GRANT ALL ON TABLE "public"."event_service_positions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_service_positions" TO "authenticated";



GRANT ALL ON TABLE "public"."event_service_slots" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_service_slots" TO "authenticated";



GRANT ALL ON TABLE "public"."event_service_units" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_service_units" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."forjados_adm_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."forjados_adm_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."forjados_adm_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."forjados_editions" TO "authenticated";
GRANT ALL ON TABLE "public"."forjados_editions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."forjados_eqp_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."forjados_eqp_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."forjados_eqp_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."internal_runtime_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."material_item_history" TO "service_role";
GRANT SELECT ON TABLE "public"."material_item_history" TO "authenticated";



GRANT ALL ON TABLE "public"."material_items" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."material_items" TO "authenticated";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."payment_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."points_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."points_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."points_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."points_store_product_images" TO "anon";
GRANT ALL ON TABLE "public"."points_store_product_images" TO "authenticated";
GRANT ALL ON TABLE "public"."points_store_product_images" TO "service_role";



GRANT ALL ON TABLE "public"."points_store_products" TO "anon";
GRANT ALL ON TABLE "public"."points_store_products" TO "authenticated";
GRANT ALL ON TABLE "public"."points_store_products" TO "service_role";



GRANT ALL ON TABLE "public"."product_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."product_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."product_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."public_panel_items" TO "anon";
GRANT ALL ON TABLE "public"."public_panel_items" TO "authenticated";
GRANT ALL ON TABLE "public"."public_panel_items" TO "service_role";



GRANT ALL ON TABLE "public"."push_notification_queue" TO "anon";
GRANT ALL ON TABLE "public"."push_notification_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."push_notification_queue" TO "service_role";



GRANT ALL ON TABLE "public"."retreat_events" TO "anon";
GRANT ALL ON TABLE "public"."retreat_events" TO "authenticated";
GRANT ALL ON TABLE "public"."retreat_events" TO "service_role";



GRANT ALL ON TABLE "public"."retreat_participations" TO "anon";
GRANT ALL ON TABLE "public"."retreat_participations" TO "authenticated";
GRANT ALL ON TABLE "public"."retreat_participations" TO "service_role";



GRANT ALL ON TABLE "public"."ride_passengers" TO "anon";
GRANT ALL ON TABLE "public"."ride_passengers" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_passengers" TO "service_role";



GRANT ALL ON TABLE "public"."rides" TO "anon";
GRANT ALL ON TABLE "public"."rides" TO "authenticated";
GRANT ALL ON TABLE "public"."rides" TO "service_role";



GRANT ALL ON TABLE "public"."service_assignments" TO "anon";
GRANT ALL ON TABLE "public"."service_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."service_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."service_people" TO "anon";
GRANT ALL ON TABLE "public"."service_people" TO "authenticated";
GRANT ALL ON TABLE "public"."service_people" TO "service_role";



GRANT ALL ON TABLE "public"."service_scale_assignments" TO "anon";
GRANT ALL ON TABLE "public"."service_scale_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."service_scale_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."service_scale_people" TO "anon";
GRANT ALL ON TABLE "public"."service_scale_people" TO "authenticated";
GRANT ALL ON TABLE "public"."service_scale_people" TO "service_role";



GRANT ALL ON TABLE "public"."service_scale_slot_requirements" TO "authenticated";
GRANT ALL ON TABLE "public"."service_scale_slot_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."service_schedules" TO "anon";
GRANT ALL ON TABLE "public"."service_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."service_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."shirt_images" TO "anon";
GRANT ALL ON TABLE "public"."shirt_images" TO "authenticated";
GRANT ALL ON TABLE "public"."shirt_images" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."shirt_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."shirt_order_items" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."shirt_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."shirt_orders" TO "service_role";



GRANT ALL ON TABLE "public"."shirts" TO "anon";
GRANT ALL ON TABLE "public"."shirts" TO "authenticated";
GRANT ALL ON TABLE "public"."shirts" TO "service_role";



GRANT ALL ON TABLE "public"."system_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";



GRANT ALL ON TABLE "public"."trail_group_traffic" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."trail_group_traffic" TO "authenticated";



GRANT ALL ON TABLE "public"."trail_group_traffic_history" TO "service_role";
GRANT SELECT ON TABLE "public"."trail_group_traffic_history" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."trail_group_traffic_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."trail_group_traffic_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."trail_group_traffic_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."trail_map_connections" TO "service_role";
GRANT SELECT ON TABLE "public"."trail_map_connections" TO "authenticated";



GRANT ALL ON TABLE "public"."trail_map_stations" TO "service_role";
GRANT SELECT ON TABLE "public"."trail_map_stations" TO "authenticated";



GRANT ALL ON TABLE "public"."trail_route_execution_steps" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."trail_route_execution_steps" TO "authenticated";



GRANT ALL ON TABLE "public"."trail_route_executions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."trail_route_executions" TO "authenticated";



GRANT ALL ON TABLE "public"."trail_route_plan_steps" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."trail_route_plan_steps" TO "authenticated";



GRANT ALL ON TABLE "public"."trail_route_plans" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."trail_route_plans" TO "authenticated";



GRANT ALL ON TABLE "public"."web_push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."web_push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."web_push_subscriptions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
