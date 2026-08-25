-- FORJADOS 2.1R.1 — índices das chaves estrangeiras
-- Migration idempotente baseada no Performance Advisor do projeto FORJADOS-app.
-- As tabelas atuais são pequenas; por isso os índices são criados na transação da migration.

create index if not exists audit_logs_actor_id_idx
  on public.audit_logs (actor_id);

create index if not exists chat_messages_receiver_id_idx
  on public.chat_messages (receiver_id);

create index if not exists chat_messages_sender_id_idx
  on public.chat_messages (sender_id);

create index if not exists notifications_user_id_idx
  on public.notifications (user_id);

create index if not exists point_transactions_granted_by_idx
  on public.point_transactions (granted_by);

create index if not exists points_redemptions_delivered_by_idx
  on public.points_redemptions (delivered_by);

create index if not exists points_redemptions_product_id_idx
  on public.points_redemptions (product_id);

create index if not exists points_redemptions_user_id_idx
  on public.points_redemptions (user_id);

create index if not exists points_store_products_deleted_by_idx
  on public.points_store_products (deleted_by);

create index if not exists product_redemptions_product_id_idx
  on public.product_redemptions (product_id);

create index if not exists product_redemptions_user_id_idx
  on public.product_redemptions (user_id);

create index if not exists public_panel_items_created_by_idx
  on public.public_panel_items (created_by);

create index if not exists public_panel_items_updated_by_idx
  on public.public_panel_items (updated_by);

create index if not exists push_notification_queue_notification_id_idx
  on public.push_notification_queue (notification_id);

create index if not exists ride_passengers_passenger_id_idx
  on public.ride_passengers (passenger_id);

create index if not exists rides_confirmed_by_idx
  on public.rides (confirmed_by);

create index if not exists service_assignments_person_id_idx
  on public.service_assignments (person_id);

create index if not exists service_scale_assignments_person_id_idx
  on public.service_scale_assignments (person_id);

create index if not exists service_scale_schedules_created_by_idx
  on public.service_scale_schedules (created_by);

create index if not exists service_schedules_created_by_idx
  on public.service_schedules (created_by);

create index if not exists system_logs_performed_by_idx
  on public.system_logs (performed_by);
