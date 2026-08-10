-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Permet aux admins d'envoyer des notifications personnalisées
-- (ex: code promotionnel après un paiement).
-- ============================================================

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('mention', 'like', 'comment', 'custom'));

alter table notifications add column if not exists message text;

drop policy if exists "staff envoie des notifications personnalisees" on notifications;
create policy "staff envoie des notifications personnalisees" on notifications for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role in ('moderator', 'owner'))
);
