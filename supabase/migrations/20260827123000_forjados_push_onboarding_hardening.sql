-- FORJADOS 2.1R6 — inscrição push segura e teste ponta a ponta.

create or replace function public.forjados_register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_subscription_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  if coalesce(length(p_endpoint), 0) < 20
    or length(p_endpoint) > 4096
    or p_endpoint !~ '^https://'
  then
    raise exception 'Endpoint de notificação inválido.' using errcode = '22023';
  end if;

  if coalesce(length(p_p256dh), 0) < 20 or length(p_p256dh) > 512 then
    raise exception 'Chave de assinatura inválida.' using errcode = '22023';
  end if;

  if coalesce(length(p_auth), 0) < 8 or length(p_auth) > 512 then
    raise exception 'Autorização da assinatura inválida.' using errcode = '22023';
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

revoke all on function public.forjados_register_push_subscription(text, text, text, text) from public;
revoke all on function public.forjados_register_push_subscription(text, text, text, text) from anon;
grant execute on function public.forjados_register_push_subscription(text, text, text, text) to authenticated;

create or replace function public.forjados_send_test_push_notification()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_notification_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.web_push_subscriptions subscription
    where subscription.user_id = v_user_id
      and subscription.is_active = true
  ) then
    raise exception 'Ative as notificações neste aparelho antes de enviar o teste.'
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
    'Notificações FORJADOS ativas',
    'Tudo certo! Este aparelho está preparado para receber avisos importantes.',
    'push_test'
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

revoke all on function public.forjados_send_test_push_notification() from public;
revoke all on function public.forjados_send_test_push_notification() from anon;
grant execute on function public.forjados_send_test_push_notification() to authenticated;
