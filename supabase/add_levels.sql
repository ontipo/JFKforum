-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Nécessaire pour le système de niveaux (0 à 7) : compte le
-- nombre de publications de chaque utilisateur automatiquement.
-- ============================================================

alter table profiles add column if not exists posts_count integer not null default 0;

-- Recalcule les compteurs existants (utile si tu as déjà des posts en base)
update profiles p set posts_count = (
  select count(*) from posts where author_id = p.id
);

create or replace function apply_post_count_effect() returns trigger
security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update profiles set posts_count = posts_count + 1 where id = new.author_id;
    return new;
  elsif tg_op = 'DELETE' then
    update profiles set posts_count = posts_count - 1 where id = old.author_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_apply_post_count_effect on posts;
create trigger trg_apply_post_count_effect after insert or delete on posts
for each row execute function apply_post_count_effect();
