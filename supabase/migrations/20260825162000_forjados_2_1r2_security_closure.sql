begin;

-- FORJADOS 2.1R.2
-- Remove políticas permissivas antigas que continuavam somando acesso às
-- políticas mais restritivas. As operações internas seguem funcionando por
-- RPCs SECURITY DEFINER e triggers já auditados.

-- A trilha de auditoria não pode ser forjada por inserts diretos do cliente.
drop policy if exists audit_insert_authenticated on public.audit_logs;

-- Notificações geradas pelo sistema usam funções/triggers internas. O cliente
-- autenticado não deve poder criar notificações arbitrárias para terceiros.
drop policy if exists notifications_insert_system on public.app_notifications;

-- Pontos e resgates são transacionais. Somente as RPCs oficiais podem criar
-- lançamentos ou resgates, garantindo saldo, estoque, escopo do líder e log.
drop policy if exists points_insert_leader_plus on public.point_transactions;
drop policy if exists points_redemptions_insert_own on public.points_redemptions;
drop policy if exists redemptions_insert_own on public.product_redemptions;

-- Escala de serviço: políticas legadas davam escrita irrestrita a qualquer
-- usuário autenticado e expunham telefone, e-mail e notas operacionais.
drop policy if exists service_people_delete_authenticated on public.service_scale_people;
drop policy if exists service_people_insert_authenticated on public.service_scale_people;
drop policy if exists service_people_select_authenticated on public.service_scale_people;
drop policy if exists service_people_update_authenticated on public.service_scale_people;
drop policy if exists service_scale_people_delete_manager on public.service_scale_people;
drop policy if exists service_scale_people_insert_manager on public.service_scale_people;
drop policy if exists service_scale_people_select_authenticated on public.service_scale_people;
drop policy if exists service_scale_people_update_manager on public.service_scale_people;

create policy forjados_2_1r2_service_scale_people_select_manager
on public.service_scale_people
for select
to authenticated
using ((select public.can_manage_service_scale()));

create policy forjados_2_1r2_service_scale_people_insert_manager
on public.service_scale_people
for insert
to authenticated
with check ((select public.can_manage_service_scale()));

create policy forjados_2_1r2_service_scale_people_update_manager
on public.service_scale_people
for update
to authenticated
using ((select public.can_manage_service_scale()))
with check ((select public.can_manage_service_scale()));

create policy forjados_2_1r2_service_scale_people_delete_manager
on public.service_scale_people
for delete
to authenticated
using ((select public.can_manage_service_scale()));

drop policy if exists service_assignments_delete_authenticated on public.service_scale_assignments;
drop policy if exists service_assignments_insert_authenticated on public.service_scale_assignments;
drop policy if exists service_assignments_select_authenticated on public.service_scale_assignments;
drop policy if exists service_assignments_update_authenticated on public.service_scale_assignments;

create policy forjados_2_1r2_service_scale_assignments_select_manager
on public.service_scale_assignments
for select
to authenticated
using ((select public.can_manage_service_scale()));

create policy forjados_2_1r2_service_scale_assignments_insert_manager
on public.service_scale_assignments
for insert
to authenticated
with check ((select public.can_manage_service_scale()));

create policy forjados_2_1r2_service_scale_assignments_update_manager
on public.service_scale_assignments
for update
to authenticated
using ((select public.can_manage_service_scale()))
with check ((select public.can_manage_service_scale()));

create policy forjados_2_1r2_service_scale_assignments_delete_manager
on public.service_scale_assignments
for delete
to authenticated
using ((select public.can_manage_service_scale()));

drop policy if exists service_schedules_delete_authenticated on public.service_scale_schedules;
drop policy if exists service_schedules_insert_authenticated on public.service_scale_schedules;
drop policy if exists service_schedules_select_authenticated on public.service_scale_schedules;
drop policy if exists service_schedules_update_authenticated on public.service_scale_schedules;

create policy forjados_2_1r2_service_scale_schedules_select_manager
on public.service_scale_schedules
for select
to authenticated
using ((select public.can_manage_service_scale()));

create policy forjados_2_1r2_service_scale_schedules_insert_manager
on public.service_scale_schedules
for insert
to authenticated
with check ((select public.can_manage_service_scale()));

create policy forjados_2_1r2_service_scale_schedules_update_manager
on public.service_scale_schedules
for update
to authenticated
using ((select public.can_manage_service_scale()))
with check ((select public.can_manage_service_scale()));

create policy forjados_2_1r2_service_scale_schedules_delete_manager
on public.service_scale_schedules
for delete
to authenticated
using ((select public.can_manage_service_scale()));

-- Storage público: leitura continua pública, mas escrita passa a exigir
-- diretoria/admin. Removemos todas as políticas antigas que liberavam qualquer
-- usuário autenticado ou duplicavam as mesmas permissões.
drop policy if exists "Authenticated delete app images" on storage.objects;
drop policy if exists "Authenticated update app images" on storage.objects;
drop policy if exists "Authenticated upload points store products" on storage.objects;
drop policy if exists "Authenticated upload public panel" on storage.objects;
drop policy if exists "Authenticated upload shirts" on storage.objects;
drop policy if exists auth_upload_points_products on storage.objects;
drop policy if exists auth_upload_public_panel on storage.objects;
drop policy if exists auth_upload_shirts on storage.objects;

drop policy if exists "Loja de Camisas - admins atualizam fotos" on storage.objects;
drop policy if exists "Loja de Camisas - admins enviam fotos" on storage.objects;
drop policy if exists "Loja de Camisas - admins removem fotos" on storage.objects;
drop policy if exists "Loja de Honra - admins atualizam fotos" on storage.objects;
drop policy if exists "Loja de Honra - admins enviam fotos" on storage.objects;
drop policy if exists "Loja de Honra - admins removem fotos" on storage.objects;

drop policy if exists "Loja de Camisas - fotos publicas" on storage.objects;
drop policy if exists "Loja de Honra - fotos publicas" on storage.objects;
drop policy if exists "Public read points store products" on storage.objects;
drop policy if exists "Public read public panel" on storage.objects;
drop policy if exists "Public read shirts" on storage.objects;
drop policy if exists public_read_points_products on storage.objects;
drop policy if exists public_read_public_panel on storage.objects;
drop policy if exists public_read_shirts on storage.objects;

drop policy if exists forjados_2_1r2_public_app_images_read on storage.objects;
create policy forjados_2_1r2_public_app_images_read
on storage.objects
for select
to public
using (
  bucket_id = any (array['shirts', 'points-store-products', 'public-panel']::text[])
);

drop policy if exists forjados_2_1r2_public_app_images_insert_manager on storage.objects;
create policy forjados_2_1r2_public_app_images_insert_manager
on storage.objects
for insert
to authenticated
with check (
  bucket_id = any (array['shirts', 'points-store-products', 'public-panel']::text[])
  and (select public.forjados_is_admin_or_director())
);

drop policy if exists forjados_2_1r2_public_app_images_update_manager on storage.objects;
create policy forjados_2_1r2_public_app_images_update_manager
on storage.objects
for update
to authenticated
using (
  bucket_id = any (array['shirts', 'points-store-products', 'public-panel']::text[])
  and (select public.forjados_is_admin_or_director())
)
with check (
  bucket_id = any (array['shirts', 'points-store-products', 'public-panel']::text[])
  and (select public.forjados_is_admin_or_director())
);

drop policy if exists forjados_2_1r2_public_app_images_delete_manager on storage.objects;
create policy forjados_2_1r2_public_app_images_delete_manager
on storage.objects
for delete
to authenticated
using (
  bucket_id = any (array['shirts', 'points-store-products', 'public-panel']::text[])
  and (select public.forjados_is_admin_or_director())
);

commit;
