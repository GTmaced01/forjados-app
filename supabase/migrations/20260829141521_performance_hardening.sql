-- Cover foreign keys used by joins and cascading updates/deletes.
create index if not exists event_schedule_items_created_by_idx
  on public.event_schedule_items (created_by);

create index if not exists ride_settings_updated_by_idx
  on public.ride_settings (updated_by);

-- Evaluate auth.uid() once per statement instead of once per row.
alter policy notifications_select_own on public.app_notifications
  using ((user_id = (select auth.uid())));

alter policy notifications_update_own on public.app_notifications
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy audit_select_managers on public.audit_logs
  using ((exists (
    select 1
    from profiles p
    where p.id = (select auth.uid())
      and (
        p.is_admin = true
        or p.role::text = any (array['admin'::text, 'director'::text])
      )
  )));

alter policy "admins can insert automated messages" on public.automated_messages
  with check ((exists (
    select 1
    from profiles p
    where p.id = (select auth.uid())
      and (
        coalesce(p.is_admin, false) = true
        or p.role::text = any (array['admin'::text, 'director'::text])
        or p.email = 'forjados.ofc@gmail.com'::text
      )
  )));

alter policy "admins can read automated messages" on public.automated_messages
  using ((exists (
    select 1
    from profiles p
    where p.id = (select auth.uid())
      and (
        coalesce(p.is_admin, false) = true
        or p.role::text = any (array['admin'::text, 'director'::text])
        or p.email = 'forjados.ofc@gmail.com'::text
      )
  )));

alter policy "admins can update automated messages" on public.automated_messages
  using ((exists (
    select 1
    from profiles p
    where p.id = (select auth.uid())
      and (
        coalesce(p.is_admin, false) = true
        or p.role::text = any (array['admin'::text, 'director'::text])
        or p.email = 'forjados.ofc@gmail.com'::text
      )
  )))
  with check ((exists (
    select 1
    from profiles p
    where p.id = (select auth.uid())
      and (
        coalesce(p.is_admin, false) = true
        or p.role::text = any (array['admin'::text, 'director'::text])
        or p.email = 'forjados.ofc@gmail.com'::text
      )
  )));

alter policy messages_insert_sender on public.chat_messages
  with check ((sender_id = (select auth.uid())));

alter policy messages_select_participants on public.chat_messages
  using ((exists (
    select 1
    from chats c
    where c.id = chat_messages.chat_id
      and (
        (select auth.uid()) = any (c.participants)
        or is_admin()
      )
  )));

alter policy chats_insert_authenticated on public.chats
  with check (((select auth.uid()) = any (participants)));

alter policy chats_select_participants on public.chats
  using (((select auth.uid()) = any (participants) or is_admin()));

alter policy chats_update_participants on public.chats
  using (((select auth.uid()) = any (participants) or is_admin()))
  with check (((select auth.uid()) = any (participants) or is_admin()));

alter policy notifications_select_own on public.notifications
  using ((user_id = (select auth.uid()) or is_admin()));

alter policy notifications_update_own on public.notifications
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy points_select on public.point_transactions
  using ((
    user_id = (select auth.uid())
    or is_admin()
    or is_director_or_admin()
    or exists (
      select 1
      from profiles p
      where p.id = (select auth.uid())
        and p.role = 'leader'::user_role
    )
  ));

alter policy points_redemptions_select on public.points_redemptions
  using ((
    user_id = (select auth.uid())
    or is_admin()
    or is_director_or_admin()
  ));

alter policy redemptions_select on public.product_redemptions
  using ((
    user_id = (select auth.uid())
    or is_admin()
    or is_director_or_admin()
  ));

alter policy "admins can view push queue" on public.push_notification_queue
  using ((exists (
    select 1
    from profiles p
    where p.id = (select auth.uid())
      and (
        coalesce(p.is_admin, false) = true
        or p.role::text = any (array['admin'::text, 'director'::text])
      )
  )));

alter policy "admins can read participations" on public.retreat_participations
  using (((select auth.uid()) = user_id or forjados_can_manage_treasury_v1()));

alter policy ride_passengers_delete_own on public.ride_passengers
  using ((passenger_id = (select auth.uid())));

alter policy ride_passengers_insert_own on public.ride_passengers
  with check ((passenger_id = (select auth.uid())));

alter policy ride_passengers_update_driver_or_director on public.ride_passengers
  using ((
    passenger_id = (select auth.uid())
    or is_admin()
    or is_director_or_admin()
    or exists (
      select 1
      from rides r
      where r.id = ride_passengers.ride_id
        and r.driver_id = (select auth.uid())
    )
  ))
  with check ((
    passenger_id = (select auth.uid())
    or is_admin()
    or is_director_or_admin()
    or exists (
      select 1
      from rides r
      where r.id = ride_passengers.ride_id
        and r.driver_id = (select auth.uid())
    )
  ));

alter policy rides_insert_own on public.rides
  with check ((driver_id = (select auth.uid())));

alter policy rides_update_driver_or_director on public.rides
  using ((
    driver_id = (select auth.uid())
    or is_admin()
    or is_director_or_admin()
  ))
  with check ((
    driver_id = (select auth.uid())
    or is_admin()
    or is_director_or_admin()
  ));

alter policy "users can create own push subscriptions" on public.web_push_subscriptions
  with check ((user_id = (select auth.uid())));

alter policy "users can update own push subscriptions" on public.web_push_subscriptions
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "users can view own push subscriptions" on public.web_push_subscriptions
  using ((user_id = (select auth.uid())));
